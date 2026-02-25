import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

interface Appointment {
    id: string
    appointment_date: string
    appointment_type: 'online' | 'presencial'
    location_address: string | null
    status: string
    notes: string | null
    leads: {
        name: string | null
        phone: string
        company_name: string | null
        corporate_email: string | null
    } | null
}


interface Availability {
    id: string
    day_of_week: number
    start_time: string
    end_time: string
    is_active: boolean
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const getBudgetLabel = (range: string | null) => {
    if (!range) return null;
    if (range === 'C') return 'R$ 100k+';
    if (range === 'B') return 'R$ 60k-100k';
    if (range === 'A') return 'R$ 35k-60k';
    return range;
}

export default function ScheduleView() {
    const { tenantId } = useTenant()
    const [view, setView] = useState<'calendar' | 'config'>('calendar')
    const [availability, setAvailability] = useState<Availability[]>([])
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchAvailability = async () => {
        if (!supabase) return
        const { data } = await supabase.from('availability').select('*').order('day_of_week', { ascending: true })
        setAvailability(data || [])
    }

    const fetchAppointments = async () => {
        if (!supabase || !tenantId) return
        const { data } = await supabase
            .from('appointments')
            .select('*, leads(name, phone, company_name, corporate_email)')
            .eq('tenant_id', tenantId)
            .in('status', ['confirmed', 'cancelled', 'scheduled', 'completed'])
        setAppointments(data || [])
    }

    useEffect(() => {
        if (!supabase || !tenantId) return
        setLoading(true)
        Promise.all([fetchAvailability(), fetchAppointments()]).then(() => setLoading(false))

        const channel = supabase.channel('calendar-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
                fetchAppointments()
            })
            .subscribe()

        return () => { if (supabase) supabase.removeChannel(channel) }
    }, [tenantId])

    const updateTimes = async (id: string, start: string, end: string) => {
        if (!supabase) return
        await supabase.from('availability').update({
            start_time: start,
            end_time: end
        }).eq('id', id)
        fetchAvailability()
    }

    const toggleActive = async (id: string, current: boolean) => {
        if (!supabase) return
        await supabase.from('availability').update({ is_active: !current }).eq('id', id)
        fetchAvailability()
    }

    // Calendar Logic
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    const startDay = startOfMonth.getDay()
    const daysInMonth = endOfMonth.getDate()

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))

    if (loading) return (
        <div className="flex items-center justify-center h-[50vh]">
            <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    )

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* View Switcher */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
                    <button
                        onClick={() => setView('calendar')}
                        className={`px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${view === 'calendar' ? 'bg-primary text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        Calendário
                    </button>
                    <button
                        onClick={() => setView('config')}
                        className={`px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${view === 'config' ? 'bg-primary text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        Configurações
                    </button>
                </div>

                {view === 'calendar' && (
                    <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
                        <button onClick={prevMonth} className="text-gray-500 hover:text-white" title="Mês Anterior">
                            <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <h4 className="text-white font-heading text-sm min-w-[120px] text-center uppercase tracking-widest">
                            {currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                        </h4>
                        <button onClick={nextMonth} className="text-gray-500 hover:text-white" title="Próximo Mês">
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>
                )}
            </div>

            {view === 'calendar' ? (
                <div className="backstagefy-glass-card p-4 overflow-hidden">
                    <div className="grid grid-cols-7 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                        {DAYS.map(d => (
                            <div key={d} className="bg-bg-dark/40 py-4 text-center">
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em]">{d}</span>
                            </div>
                        ))}

                        {Array.from({ length: 42 }).map((_, i) => {
                            const day = i - startDay + 1
                            const isCurrentMonth = day > 0 && day <= daysInMonth
                            const dateStr = isCurrentMonth ? `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
                            const dayApps = appointments.filter(a => {
                                if (!a.appointment_date) return false;
                                const appDate = new Date(a.appointment_date);
                                const appDateStr = `${appDate.getFullYear()}-${String(appDate.getMonth() + 1).padStart(2, '0')}-${String(appDate.getDate()).padStart(2, '0')}`;
                                return isCurrentMonth && appDateStr === dateStr;
                            })

                            return (
                                <div key={i} className={`min-h-[180px] bg-bg-dark/20 p-4 border-t border-l border-white/[0.03] ${!isCurrentMonth ? 'opacity-20' : ''}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[11px] font-mono ${day === new Date().getDate() && currentMonth.getMonth() === new Date().getMonth() ? 'text-primary font-bold' : 'text-gray-700'}`}>
                                            {isCurrentMonth ? String(day).padStart(2, '0') : ''}
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        {/* Standard appointments */}
                                        {dayApps.map(app => (
                                            <button
                                                key={app.id}
                                                onClick={() => setSelectedAppointment(app)}
                                                className={`w-full text-left p-3 rounded-xl border transition-all group ${app.status === 'cancelled' ? 'bg-red-500/5 border-red-500/20 opacity-60 grayscale' : 'bg-primary/10 border-primary/20 hover:bg-primary/20'}`}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className={`text-[11px] font-bold truncate uppercase ${app.status === 'cancelled' ? 'text-red-400' : 'text-primary'}`}>{app.leads?.name || app.leads?.company_name || 'Agendamento'}</p>
                                                    <span className="material-symbols-outlined text-xs text-primary/40">
                                                        {app.appointment_type === 'online' ? 'laptop_mac' : 'apartment'}
                                                    </span>
                                                </div>
                                                <p className={`text-[9px] font-mono ${app.status === 'cancelled' ? 'text-red-400/60' : 'text-primary/60'}`}>{new Date(app.appointment_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    <div className="xl:col-span-2 backstagefy-glass-card p-10 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-white text-xl font-heading mb-2">Horários de Atendimento</h3>
                            <p className="text-gray-500 text-sm mb-8">Defina os períodos em que a IA BackStageFy pode oferecer visitas guiadas.</p>
                            <div className="space-y-4">
                                {DAYS.map((day, index) => {
                                    const slot = availability.find(a => a.day_of_week === index)
                                    return (
                                        <div key={index} className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-primary/20 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`size-2 rounded-full ${slot?.is_active ? 'bg-primary animate-pulse' : 'bg-gray-800'}`}></div>
                                                <span className={`text-sm font-bold uppercase tracking-widest ${slot?.is_active ? 'text-white' : 'text-gray-600'}`}>
                                                    {day}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-12">
                                                <div className="flex items-center bg-black/40 rounded-xl px-4 py-2 border border-white/5 gap-2 group-hover:border-primary/40 transition-all">
                                                    <input
                                                        type="time"
                                                        value={slot?.start_time?.slice(0, 5) || '09:00'}
                                                        onChange={(e) => slot && updateTimes(slot.id, e.target.value, slot.end_time)}
                                                        className="bg-transparent border-none text-white font-mono text-sm focus:ring-0 focus:outline-none w-16 p-0"
                                                    />
                                                    <span className="text-gray-700 text-xs">até</span>
                                                    <input
                                                        type="time"
                                                        value={slot?.end_time?.slice(0, 5) || '18:00'}
                                                        onChange={(e) => slot && updateTimes(slot.id, slot.start_time, e.target.value)}
                                                        className="bg-transparent border-none text-white font-mono text-sm focus:ring-0 focus:outline-none w-16 p-0"
                                                    />
                                                </div>
                                                <button onClick={() => slot && toggleActive(slot.id, slot.is_active)}
                                                    className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${slot?.is_active ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20' : 'bg-white/5 text-gray-500 border border-white/10 hover:border-white/20'}`}>
                                                    {slot?.is_active ? 'Ativo' : 'Pausado'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="backstagefy-glass-card p-10 border-primary/10 h-fit">
                        <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 text-primary">
                            <span className="material-symbols-outlined text-2xl">robot_2</span>
                        </div>
                        <h4 className="text-white font-heading text-lg mb-3">Lógica da IA</h4>
                        <p className="text-gray-500 text-sm leading-relaxed mb-6">A BackStageFy Concierge consulta esta agenda em tempo real. Se um lead solicitar uma visita fora desses horários, a IA oferecerá gentilmente a próxima janela disponível.</p>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mb-1">Status do Motor</p>
                            <p className="text-white text-xs">Sincronizado com Supabase Realtime</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Appointment Detail Modal */}
            <AnimatePresence>
                {selectedAppointment && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedAppointment(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-lg bg-bg-dark border border-white/10 rounded-[32px] overflow-hidden shadow-2xl z-10 p-10">

                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[10px]">
                                                {selectedAppointment.appointment_type === 'online' ? 'laptop_mac' : 'apartment'}
                                            </span>
                                            Agendamento {selectedAppointment.appointment_type === 'online' ? 'Online' : 'Presencial'}
                                        </div>
                                    </div>
                                    <h3 className="text-white text-3xl font-heading leading-tight">{selectedAppointment.leads?.name || 'Cliente BackStageFy'}</h3>
                                    {selectedAppointment.leads?.company_name && (
                                        <p className="text-primary/60 text-xs font-bold uppercase tracking-[0.2em] mt-1">{selectedAppointment.leads.company_name}</p>
                                    )}
                                </div>
                                <button onClick={() => setSelectedAppointment(null)} className="text-gray-500 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">calendar_today</span> Data
                                        </p>
                                        <p className="text-white font-medium">{new Date(selectedAppointment.appointment_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
                                    </div>
                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">schedule</span> Horário
                                        </p>
                                        <p className="text-white font-medium font-mono">{new Date(selectedAppointment.appointment_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>

                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">location_on</span> Localização / Link da Reunião
                                    </p>
                                    <p className="text-white/90 text-sm leading-relaxed">
                                        {selectedAppointment.location_address || (selectedAppointment.appointment_type === 'online' ? 'O link da reunião será gerado em breve' : 'Endereço não informado')}
                                    </p>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <a
                                        href={`https://wa.me/${selectedAppointment.leads?.phone?.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-1 backstagefy-btn-primary py-4 rounded-2xl flex items-center justify-center gap-3"
                                    >
                                        <span className="material-symbols-outlined">chat</span>
                                        Abrir WhatsApp
                                    </a>
                                    <button className="px-6 rounded-2xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all">
                                        <span className="material-symbols-outlined">more_vert</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
