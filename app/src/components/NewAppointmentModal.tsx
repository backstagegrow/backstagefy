import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { brazilToUTC } from '../lib/timezone'

interface NewAppointmentModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

interface LeadOption { id: string; name: string | null; phone: string }
interface AvailabilitySlot { day_of_week: number; start_time: string; end_time: string; is_active: boolean; appointment_interval: number }

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function NewAppointmentModal({ isOpen, onClose, onSuccess }: NewAppointmentModalProps) {
    const { tenantId } = useTenant()
    const [loading, setLoading] = useState(false)
    const [leads, setLeads] = useState<LeadOption[]>([])
    const [availability, setAvailability] = useState<AvailabilitySlot[]>([])
    const [formData, setFormData] = useState({
        lead_id: '',
        appointment_date: '',
        appointment_time: '',
        appointment_type: 'presencial' as 'online' | 'presencial',
        notes: '',
    })

    // Fetch leads + availability on open
    useEffect(() => {
        if (!isOpen || !supabase || !tenantId) return
        supabase
            .from('leads')
            .select('id, name, phone')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true })
            .then(({ data }) => setLeads(data || []))

        supabase
            .from('availability')
            .select('day_of_week, start_time, end_time, is_active, appointment_interval')
            .eq('tenant_id', tenantId)
            .then(({ data }) => setAvailability(data || []))
    }, [isOpen, tenantId])

    // Get availability for selected date
    const selectedDaySlot = useMemo(() => {
        if (!formData.appointment_date) return null
        const date = new Date(formData.appointment_date + 'T12:00:00')
        const dayOfWeek = date.getDay()
        return availability.find(a => a.day_of_week === dayOfWeek) || null
    }, [formData.appointment_date, availability])

    // Generate time slots based on availability config
    const timeSlots = useMemo(() => {
        if (!selectedDaySlot || !selectedDaySlot.is_active) return []

        const startParts = selectedDaySlot.start_time.split(':')
        const endParts = selectedDaySlot.end_time.split(':')
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1])
        const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1])
        const interval = selectedDaySlot.appointment_interval || 60

        const slots: string[] = []
        for (let m = startMinutes; m + interval <= endMinutes; m += interval) {
            const h = Math.floor(m / 60).toString().padStart(2, '0')
            const min = (m % 60).toString().padStart(2, '0')
            slots.push(`${h}:${min}`)
        }

        // Filter out past times if date is today
        const today = new Date().toISOString().slice(0, 10)
        if (formData.appointment_date === today) {
            const now = new Date()
            const nowMinutes = now.getHours() * 60 + now.getMinutes()
            return slots.filter(s => {
                const [hh, mm] = s.split(':').map(Number)
                return hh * 60 + mm > nowMinutes
            })
        }

        return slots
    }, [selectedDaySlot, formData.appointment_date])

    // Day label for the selected date
    const selectedDayLabel = useMemo(() => {
        if (!formData.appointment_date) return ''
        const date = new Date(formData.appointment_date + 'T12:00:00')
        return DAYS_PT[date.getDay()]
    }, [formData.appointment_date])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase || !tenantId) return
        if (!formData.lead_id || !formData.appointment_date || !formData.appointment_time) {
            alert('Preencha lead, data e horário.')
            return
        }
        setLoading(true)

        const dateTimeUTC = brazilToUTC(formData.appointment_date, formData.appointment_time)
        const interval = selectedDaySlot?.appointment_interval || 60
        const startDate = new Date(dateTimeUTC)
        const endDate = new Date(startDate.getTime() + interval * 60 * 1000)

        try {
            // 1. Insert in DB — appointment_date in UTC
            const { data: appointment, error } = await supabase.from('appointments').insert([{
                tenant_id: tenantId,
                lead_id: formData.lead_id,
                appointment_date: dateTimeUTC,
                appointment_type: formData.appointment_type,
                notes: formData.notes || null,
                status: 'scheduled',
                scheduled_by: 'human',
            }]).select('id').single()
            if (error) throw error

            // 2. Try to sync with Google Calendar (non-blocking)
            const selectedLead = leads.find(l => l.id === formData.lead_id)
            const leadName = selectedLead?.name || selectedLead?.phone || 'Lead'

            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.access_token) {
                    const EDGE_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/google-calendar-auth'
                    const gcalRes = await fetch(`${EDGE_URL}?action=create-event`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            summary: `${formData.appointment_type === 'online' ? '💻' : '🏢'} Visita: ${leadName}`,
                            description: `Agendamento BackStageFy\nLead: ${leadName}\nTelefone: ${selectedLead?.phone || ''}\nTipo: ${formData.appointment_type}\n${formData.notes ? `Obs: ${formData.notes}` : ''}`,
                            start_time: startDate.toISOString(),
                            end_time: endDate.toISOString(),
                            appointment_type: formData.appointment_type,
                        }),
                    })
                    if (gcalRes.ok) {
                        const gcalData = await gcalRes.json()
                        if (gcalData.event_id && appointment?.id) {
                            await supabase.from('appointments').update({ google_event_id: gcalData.event_id }).eq('id', appointment.id)
                        }
                    }
                }
            } catch (gcalErr) {
                console.warn('Google Calendar sync failed (appointment still saved):', gcalErr)
            }

            onSuccess()
            onClose()
            setFormData({ lead_id: '', appointment_date: '', appointment_time: '', appointment_type: 'presencial', notes: '' })
        } catch (err: unknown) {
            console.error('Error creating appointment:', err)
            const msg = (err as { message?: string })?.message ?? ''
            alert(`Erro ao agendar: ${msg}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-lg backstagefy-glass-card p-8 relative max-h-[90vh] overflow-y-auto scrollbar-hide"
                    >
                        <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>

                        <h2 className="text-white text-xl font-heading mb-1">Novo Agendamento</h2>
                        <p className="text-primary text-[10px] font-bold uppercase tracking-[0.2em] mb-6">Agendar visita manual</p>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Lead Selector */}
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Lead / Cliente</label>
                                <select
                                    value={formData.lead_id}
                                    onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:border-primary/40 focus:ring-0 focus:outline-none transition-all appearance-none"
                                    required
                                >
                                    <option value="" className="bg-[#111]">Selecione um lead...</option>
                                    {leads.map(l => (
                                        <option key={l.id} value={l.id} className="bg-[#111]">
                                            {l.name || l.phone} — {l.phone}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Date */}
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Data</label>
                                <input
                                    type="date"
                                    value={formData.appointment_date}
                                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value, appointment_time: '' })}
                                    min={new Date().toISOString().slice(0, 10)}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:border-primary/40 focus:ring-0 focus:outline-none transition-all"
                                    required
                                />
                                {formData.appointment_date && (
                                    <p className="text-gray-500 text-xs mt-1.5 flex items-center gap-1.5">
                                        <span className={`size-2 rounded-full ${selectedDaySlot?.is_active ? 'bg-primary' : 'bg-red-500'}`} />
                                        {selectedDayLabel}
                                        {selectedDaySlot?.is_active
                                            ? ` — ${selectedDaySlot.start_time.slice(0,5)} até ${selectedDaySlot.end_time.slice(0,5)} (intervalo ${selectedDaySlot.appointment_interval}min)`
                                            : ' — Dia pausado (sem atendimento)'}
                                    </p>
                                )}
                            </div>

                            {/* Time Slots */}
                            {formData.appointment_date && (
                                <div>
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Horário disponível</label>
                                    {!selectedDaySlot?.is_active ? (
                                        <p className="text-red-400/80 text-xs bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
                                            <span className="material-symbols-outlined text-sm align-middle mr-1">block</span>
                                            Este dia está pausado nas configurações. Ative-o primeiro em Agenda → Configurações.
                                        </p>
                                    ) : timeSlots.length === 0 ? (
                                        <p className="text-amber-400/80 text-xs bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-3">
                                            <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
                                            Nenhum horário disponível para este dia. Todos os slots já passaram.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-4 gap-2">
                                            {timeSlots.map(slot => (
                                                <button
                                                    key={slot}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, appointment_time: slot })}
                                                    className={`py-3 rounded-xl text-sm font-mono font-bold transition-all border ${
                                                        formData.appointment_time === slot
                                                            ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20'
                                                            : 'bg-white/[0.03] text-gray-400 border-white/10 hover:border-primary/30 hover:text-white'
                                                    }`}
                                                >
                                                    {slot}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Type */}
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Tipo de Visita</label>
                                <div className="flex gap-3">
                                    {(['presencial', 'online'] as const).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, appointment_type: t })}
                                            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                                                formData.appointment_type === t
                                                    ? 'bg-primary/10 text-primary border-primary/30'
                                                    : 'bg-white/[0.03] text-gray-500 border-white/10 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-sm mr-1 align-middle">
                                                {t === 'presencial' ? 'apartment' : 'laptop_mac'}
                                            </span>
                                            {t === 'presencial' ? 'Presencial' : 'Online'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Observações</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Detalhes da visita..."
                                    rows={2}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:border-primary/40 focus:ring-0 focus:outline-none transition-all placeholder-gray-700 resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !formData.appointment_time}
                                className="w-full backstagefy-btn-primary py-4 text-sm font-bold rounded-2xl disabled:opacity-50"
                            >
                                {loading ? (
                                    <div className="size-5 border-2 border-black/20 border-t-black rounded-full animate-spin mx-auto" />
                                ) : 'Agendar Visita'}
                            </button>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
