import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

interface NewAppointmentModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

interface LeadOption {
    id: string
    name: string | null
    phone: string
}

export default function NewAppointmentModal({ isOpen, onClose, onSuccess }: NewAppointmentModalProps) {
    const { tenantId } = useTenant()
    const [loading, setLoading] = useState(false)
    const [leads, setLeads] = useState<LeadOption[]>([])
    const [formData, setFormData] = useState({
        lead_id: '',
        appointment_date: '',
        appointment_time: '',
        appointment_type: 'presencial' as 'online' | 'presencial',
        location_address: '',
        notes: '',
    })

    useEffect(() => {
        if (!isOpen || !supabase || !tenantId) return
        supabase
            .from('leads')
            .select('id, name, phone')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true })
            .then(({ data }) => setLeads(data || []))
    }, [isOpen, tenantId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase || !tenantId) return
        if (!formData.lead_id || !formData.appointment_date || !formData.appointment_time) {
            alert('Preencha lead, data e horário.')
            return
        }
        setLoading(true)

        const dateTime = `${formData.appointment_date}T${formData.appointment_time}:00`

        try {
            const { error } = await supabase.from('appointments').insert([{
                tenant_id: tenantId,
                lead_id: formData.lead_id,
                appointment_date: dateTime,
                appointment_type: formData.appointment_type,
                location_address: formData.location_address || null,
                notes: formData.notes || null,
                status: 'scheduled',
            }])
            if (error) throw error
            onSuccess()
            onClose()
            setFormData({ lead_id: '', appointment_date: '', appointment_time: '', appointment_type: 'presencial', location_address: '', notes: '' })
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
                        className="w-full max-w-lg backstagefy-glass-card p-8 relative"
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

                            {/* Date & Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Data</label>
                                    <input
                                        type="date"
                                        value={formData.appointment_date}
                                        onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:border-primary/40 focus:ring-0 focus:outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Horário</label>
                                    <input
                                        type="time"
                                        value={formData.appointment_time}
                                        onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:border-primary/40 focus:ring-0 focus:outline-none transition-all"
                                        required
                                    />
                                </div>
                            </div>

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
                                disabled={loading}
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
