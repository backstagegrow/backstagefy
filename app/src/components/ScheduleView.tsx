import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
    tenant_id: string
    day_of_week: number
    start_time: string
    end_time: string
    is_active: boolean
    appointment_interval: number
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const getBudgetLabel = (range: string | null) => {
    if (!range) return null;
    if (range === 'C') return 'R$ 100k+';
    if (range === 'B') return 'R$ 60k-100k';
    if (range === 'A') return 'R$ 35k-60k';
    return range;
}

interface GCalStatus {
    connected: boolean
    google_email: string | null
    connected_at: string | null
    calendar_id: string
}

interface GCalendar {
    id: string
    summary: string
    primary?: boolean
    backgroundColor?: string
}

export default function ScheduleView() {
    const { tenantId } = useTenant()
    const [view, setView] = useState<'calendar' | 'config'>('calendar')
    const [availability, setAvailability] = useState<Availability[]>([])
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [loading, setLoading] = useState(true)
    const [gcalStatus, setGcalStatus] = useState<GCalStatus>({ connected: false, google_email: null, connected_at: null, calendar_id: 'primary' })
    const [gcalLoading, setGcalLoading] = useState(false)
    const [calendars, setCalendars] = useState<GCalendar[]>([])
    const [calendarDropdownOpen, setCalendarDropdownOpen] = useState(false)
    const [appointmentInterval, setAppointmentInterval] = useState(60)

    const fetchAvailability = async () => {
        if (!supabase || !tenantId) return
        const { data } = await supabase
            .from('availability')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('day_of_week', { ascending: true })
        if (data && data.length > 0) {
            setAvailability(data)
            setAppointmentInterval(data[0].appointment_interval ?? 60)
        }
    }

    const fetchGcalStatus = useCallback(async () => {
        if (!supabase) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        try {
            const res = await fetch(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=status`,
                { headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY } }
            )
            if (res.ok) {
                const data = await res.json()
                setGcalStatus(data)
                localStorage.setItem('gcal_connected', data.connected ? '1' : '0')
                window.dispatchEvent(new StorageEvent('storage', { key: 'gcal_connected', newValue: data.connected ? '1' : '0' }))
                if (data.connected) handleListCalendars(false)
            }
        } catch { /* ignore */ }
    }, [supabase])

    const handleListCalendars = async (toggle = true) => {
        if (!supabase) return
        if (calendars.length > 0) { if (toggle) setCalendarDropdownOpen(v => !v); return; }
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        try {
            const res = await fetch(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=list-calendars`,
                { headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY } }
            )
            if (res.ok) {
                const { calendars: cals } = await res.json()
                setCalendars(cals ?? [])
                if (toggle) setCalendarDropdownOpen(true)
            }
        } catch { /* ignore */ }
    }

    const handleSelectCalendar = async (calendarId: string) => {
        if (!supabase) return
        setCalendarDropdownOpen(false)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        try {
            await fetch(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=select-calendar`,
                { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar_id: calendarId }) }
            )
            setGcalStatus(prev => ({ ...prev, calendar_id: calendarId }))
        } catch { /* ignore */ }
    }

    const handleGcalConnect = async () => {
        if (!supabase) return
        setGcalLoading(true)

        // Abre janela ANTES de qualquer await (evita popup blocker)
        const authWindow = window.open('about:blank', '_blank', 'width=520,height=660')

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                authWindow?.close()
                setGcalLoading(false)
                return
            }
            const res = await fetch(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=connect`,
                { headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY } }
            )
            if (!res.ok) {
                const err = await res.text()
                console.error('❌ Edge Function error:', res.status, err)
                authWindow?.close()
                setGcalLoading(false)
                return
            }
            const { url } = await res.json()
            if (authWindow) authWindow.location.href = url

            // Polling: verifica status a cada 2s enquanto o popup estiver aberto
            const token = session.access_token
            const pollInterval = setInterval(async () => {
                // Popup foi fechado pelo usuário → para de tentar
                if (!authWindow || authWindow.closed) {
                    clearInterval(pollInterval)
                    setGcalLoading(false)
                    return
                }
                try {
                    const statusRes = await fetch(
                        `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=status`,
                        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } }
                    )
                    if (statusRes.ok) {
                        const status = await statusRes.json()
                        if (status.connected) {
                            clearInterval(pollInterval)
                            authWindow?.close()
                            setGcalStatus(status)
                            setGcalLoading(false)
                        }
                    }
                } catch { /* ignore */ }
            }, 2000)
        } catch (err) {
            console.error('❌ Erro ao abrir OAuth:', err)
            authWindow?.close()
            setGcalLoading(false)
        }
    }

    const handleGcalDisconnect = async () => {
        if (!supabase) return
        setGcalLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setGcalLoading(false); return }
        try {
            await fetch(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=disconnect`,
                { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY } }
            )
            setGcalStatus({ connected: false, google_email: null, connected_at: null, calendar_id: 'primary' })
            localStorage.setItem('gcal_connected', '0')
            window.dispatchEvent(new StorageEvent('storage', { key: 'gcal_connected', newValue: '0' }))
        } catch { /* ignore */ }
        setGcalLoading(false)
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
        Promise.all([fetchAvailability(), fetchAppointments(), fetchGcalStatus()]).then(() => {
            setLoading(false)
        })

        // Detecta callback do Google OAuth na URL
        const urlParams = new URLSearchParams(window.location.search)
        const gcalParam = urlParams.get('gcal')
        if (gcalParam === 'success') {
            fetchGcalStatus()
            window.history.replaceState({}, '', window.location.pathname)
        }

        const channel = supabase.channel('calendar-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
                fetchAppointments()
            })
            .subscribe()

        return () => { if (supabase) supabase.removeChannel(channel) }
    }, [tenantId])

    const updateTimes = async (dayOfWeek: number, start: string, end: string) => {
        if (!supabase || !tenantId) return
        const { error } = await supabase.from('availability').upsert({
            tenant_id: tenantId,
            day_of_week: dayOfWeek,
            start_time: start,
            end_time: end,
        }, { onConflict: 'tenant_id,day_of_week', ignoreDuplicates: false })
        if (!error) fetchAvailability()
    }

    const toggleActive = async (dayOfWeek: number, current: boolean) => {
        if (!supabase || !tenantId) return
        const { error } = await supabase.from('availability').upsert({
            tenant_id: tenantId,
            day_of_week: dayOfWeek,
            is_active: !current,
        }, { onConflict: 'tenant_id,day_of_week', ignoreDuplicates: false })
        if (!error) fetchAvailability()
    }

    const updateInterval = async (minutes: number) => {
        if (!supabase || !tenantId) return
        setAppointmentInterval(minutes)
        await supabase.from('availability')
            .update({ appointment_interval: minutes })
            .eq('tenant_id', tenantId)
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
                        className={`px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${view === 'config' ? 'bg-primary text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={view === 'config' ? '#222' : '#4285F4'}/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={view === 'config' ? '#222' : '#34A853'}/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill={view === 'config' ? '#222' : '#FBBC05'}/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={view === 'config' ? '#222' : '#EA4335'}/>
                        </svg>
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
                                                        onChange={(e) => updateTimes(index, e.target.value, slot?.end_time?.slice(0,5) || '18:00')}
                                                        className="bg-transparent border-none text-white font-mono text-sm focus:ring-0 focus:outline-none w-16 p-0"
                                                    />
                                                    <span className="text-gray-700 text-xs">até</span>
                                                    <input
                                                        type="time"
                                                        value={slot?.end_time?.slice(0, 5) || '18:00'}
                                                        onChange={(e) => updateTimes(index, slot?.start_time?.slice(0,5) || '09:00', e.target.value)}
                                                        className="bg-transparent border-none text-white font-mono text-sm focus:ring-0 focus:outline-none w-16 p-0"
                                                    />
                                                </div>
                                                <button onClick={() => toggleActive(index, slot?.is_active ?? false)}
                                                    className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${slot?.is_active ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20' : 'bg-white/5 text-gray-500 border border-white/10 hover:border-white/20'}`}>
                                                    {slot?.is_active ? 'Ativo' : 'Pausado'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Appointment Interval */}
                            <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                                <div>
                                    <p className="text-white text-sm font-bold">Intervalo entre agendamentos</p>
                                    <p className="text-gray-500 text-xs mt-0.5">Tempo mínimo entre visitas</p>
                                </div>
                                <div className="flex gap-2">
                                    {[30, 45, 60, 90].map(min => (
                                        <button
                                            key={min}
                                            onClick={() => updateInterval(min)}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                                                appointmentInterval === min
                                                    ? 'bg-primary text-black'
                                                    : 'bg-white/5 text-gray-400 border border-white/10 hover:border-primary/30'
                                            }`}
                                        >
                                            {min}min
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        {/* Google Calendar Card */}
                        <div className="backstagefy-glass-card p-8 border-primary/10 overflow-visible">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                    <svg className="size-6" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-white font-heading text-base">Google Agenda</h4>
                                    <p className="text-gray-600 text-xs mt-0.5">Sincronize agendamentos direto com o Google Calendar</p>
                                </div>
                            </div>

                            {gcalStatus.connected ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-2xl">
                                        <div className="size-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Conectado</p>
                                            {gcalStatus.google_email && (
                                                <p className="text-gray-400 text-xs mt-0.5">{gcalStatus.google_email}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleGcalDisconnect}
                                            disabled={gcalLoading}
                                            className="flex items-center gap-1.5 text-red-500/60 hover:text-red-400 transition-colors disabled:opacity-30 group"
                                            title="Desconectar Google Agenda"
                                        >
                                            <div className="size-1.5 rounded-full bg-red-500/60 group-hover:bg-red-400 transition-colors" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">
                                                {gcalLoading ? '...' : 'desconectar'}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Calendar Selector */}
                                    <div className="relative">
                                        <button
                                            onClick={() => handleListCalendars()}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-left hover:border-white/20 transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-gray-400 text-base">event_note</span>
                                                <div>
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Agenda selecionada</p>
                                                    <p className="text-white text-xs mt-0.5 font-medium">
                                                        {calendars.find(c => c.id === gcalStatus.calendar_id)?.summary || 'Agenda Principal'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined text-gray-500 text-base">{calendarDropdownOpen ? 'expand_less' : 'expand_more'}</span>
                                        </button>

                                        {calendarDropdownOpen && calendars.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-bg-dark border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-20">
                                                {calendars.map(cal => (
                                                    <button
                                                        key={cal.id}
                                                        onClick={() => handleSelectCalendar(cal.id)}
                                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all ${
                                                            cal.id === gcalStatus.calendar_id ? 'bg-primary/10' : ''
                                                        }`}
                                                    >
                                                        <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: cal.backgroundColor || '#4285F4' }} />
                                                        <span className="text-white text-xs">{cal.summary}</span>
                                                        {cal.primary && <span className="ml-auto text-[10px] text-gray-500">principal</span>}
                                                        {cal.id === gcalStatus.calendar_id && <span className="ml-auto material-symbols-outlined text-primary text-sm">check</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            ) : (
                                <button
                                    onClick={handleGcalConnect}
                                    disabled={gcalLoading}
                                    className="w-full backstagefy-btn-primary py-4 rounded-2xl flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                                >
                                    {gcalLoading ? (
                                        <div className="size-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    ) : (
                                        <span className="material-symbols-outlined text-sm">event_available</span>
                                    )}
                                    {gcalLoading ? 'Redirecionando...' : 'Conectar Google Agenda'}
                                </button>
                            )}
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
                            className="relative w-full max-w-lg bg-bg-dark border border-white/10 rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl z-10 p-6 md:p-10">

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
