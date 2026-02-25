import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import LeadDetailModal from './LeadDetailModal'

interface Lead {
    id: string
    name: string
    phone: string
    status: string
    pipeline_stage: string
    event_type: string
    budget: string
    budget_range: string
    company_name: string
    corporate_email: string
    created_at: string
    last_interaction?: string
    appointments?: {
        appointment_date: string
        notes: string
        status: string
    }[]
}

interface Column {
    id: string
    title: string
    leads: Lead[]
    color: string
}

export default function LeadPipeline() {
    const [columns, setColumns] = useState<Column[]>([
        { id: 'new', title: 'Leads Novos', leads: [], color: 'bg-primary' },
        { id: 'attending', title: 'Em Atendimento', leads: [], color: 'bg-blue-500' },
        { id: 'scheduled', title: 'Visita Agendada', leads: [], color: 'bg-amber-500' },
        { id: 'booked', title: 'Finalizados', leads: [], color: 'bg-green-500' },
    ])
    const [loading, setLoading] = useState(true)
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const fetchLeads = async () => {
        if (!supabase) return

        try {
            const { data, error } = await supabase
                .from('leads')
                .select('*, appointments(appointment_date, notes, status)')
                .order('created_at', { ascending: false })

            if (error) throw error

            const newCols = [
                { id: 'new', title: 'Leads Novos', leads: [], color: 'bg-primary' },
                { id: 'attending', title: 'Em Atendimento', leads: [], color: 'bg-blue-500' },
                { id: 'scheduled', title: 'Visita Agendada', leads: [], color: 'bg-amber-500' },
                { id: 'booked', title: 'Finalizados', leads: [], color: 'bg-green-500' }
            ].map(col => ({
                ...col,
                leads: data?.filter(l => {
                    const stage = l.pipeline_stage || 'new';

                    if (col.id === 'scheduled') {
                        // Only auto-move to scheduled if it's NOT already in a later stage
                        const isLaterStage = stage === 'booked' || stage === 'attending';
                        const hasConfirmedAppt = l.appointments?.some(a => a.status === 'confirmed');
                        if (!isLaterStage && hasConfirmedAppt) {
                            return true;
                        }
                    }

                    return stage === col.id;
                }) || []
            }))
            setColumns(newCols)
        } catch (err) {
            console.error('Fetch Error:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDragEnd = async (leadId: string, info: any) => {
        setDraggingId(null);

        // Find columns based on X position
        const elements = document.querySelectorAll('[data-column-id]');
        let targetColumnId = null;

        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (info.point.x >= rect.left && info.point.x <= rect.right) {
                targetColumnId = el.getAttribute('data-column-id');
                break;
            }
        }

        if (targetColumnId) {
            // Optimistic update
            const lead = columns.flatMap(c => c.leads).find(l => l.id === leadId);
            if (lead && lead.pipeline_stage !== targetColumnId) {
                console.log(`[PIPELINE] Moving ${leadId} to ${targetColumnId}`);

                // Update Local UI Fast
                setColumns(prev => prev.map(col => ({
                    ...col,
                    leads: col.id === targetColumnId
                        ? [...col.leads.filter(l => l.id !== leadId), { ...lead, pipeline_stage: targetColumnId }]
                        : col.leads.filter(l => l.id !== leadId)
                })));

                // Persist to DB
                try {
                    const { error } = await supabase!.from('leads').update({ pipeline_stage: targetColumnId }).eq('id', leadId);
                    if (error) throw error;
                } catch (err) {
                    console.error('Update Status Error:', err);
                    fetchLeads(); // Rollback to real data
                }
            }
        }
    }

    useEffect(() => {
        fetchLeads()

        const channel = supabase?.channel('pipeline-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
                if (!draggingId) fetchLeads();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
                if (!draggingId) fetchLeads();
            })
            .subscribe()

        return () => { if (channel) supabase?.removeChannel(channel) }
    }, [draggingId])

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 h-full overflow-x-auto pb-10 scrollbar-hide">
                {columns.map((column) => (
                    <div
                        key={column.id}
                        data-column-id={column.id}
                        className="flex flex-col h-full min-w-[300px] backstagefy-glass-card bg-white/[0.01] border-white/[0.02] p-4 rounded-3xl"
                    >
                        {/* Column Header */}
                        <div className="flex items-center justify-between mb-8 px-2 pt-2">
                            <div className="flex items-center gap-3">
                                <div className={`size-2 rounded-full ${column.color} shadow-lg shadow-${column.color}/40`}></div>
                                <h3 className="text-white font-heading font-medium tracking-tight text-sm uppercase tracking-[0.1em]">{column.title}</h3>
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded-md">
                                {column.leads.length}
                            </span>
                        </div>

                        {/* Column Body */}
                        <div className="flex-1 space-y-4 pr-1 scrollbar-hide">
                            <AnimatePresence mode="popLayout">
                                {column.leads.map((lead) => {
                                    const app = lead.appointments?.find(a => a.status === 'confirmed');
                                    const hasAppointment = !!app;
                                    const appointmentDate = app ? new Date(app.appointment_date) : null;

                                    return (
                                        <motion.div
                                            key={lead.id}
                                            layout
                                            drag
                                            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                                            dragElastic={0.9}
                                            onDragStart={() => setDraggingId(lead.id)}
                                            onDragEnd={(_, info) => handleDragEnd(lead.id, info)}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            whileDrag={{ scale: 1.05, zIndex: 100, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}
                                            onClick={() => {
                                                if (!draggingId) setSelectedLead(lead);
                                            }}
                                            className={`backstagefy-glass-card p-5 group cursor-grab active:cursor-grabbing border transition-all duration-500 relative overflow-hidden ${lead.budget_range === 'C'
                                                ? 'border-amber-500/30'
                                                : lead.budget_range === 'B'
                                                    ? 'border-primary/20 hover:border-primary/40'
                                                    : 'border-white/[0.03] hover:border-white/10'
                                                }`}
                                        >
                                            {/* Rank Badge */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-white font-bold text-base tracking-tight group-hover:text-primary transition-colors truncate max-w-[150px]">
                                                            {lead.name || lead.company_name || lead.phone}
                                                        </h4>
                                                        {lead.budget_range === 'C' && (
                                                            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-tighter border border-amber-500/20">
                                                                VIP
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-sm font-mono tracking-tighter mt-1">{lead.phone}</p>
                                                </div>
                                                <div className={`px-2 py-1 rounded text-[11px] font-bold uppercase tracking-widest ${lead.status === 'quente' ? 'bg-red-500/10 text-red-500' :
                                                    lead.status === 'morno' ? 'bg-amber-500/10 text-amber-400' :
                                                        'bg-gray-500/10 text-gray-500'
                                                    }`}>
                                                    {lead.status === 'quente' ? 'Hot' : lead.status === 'morno' ? 'Warm' : 'Cold'}
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-2 border-t border-white/[0.03]">
                                                <div className="flex items-center justify-between text-xs font-bold">
                                                    <span className="text-primary/60 uppercase tracking-widest">Budget</span>
                                                    <span className="text-white text-base font-bold">
                                                        {lead.budget_range === 'A' ? 'R$ 35k-60k' :
                                                            lead.budget_range === 'B' ? 'R$ 60k-100k' :
                                                                lead.budget_range === 'C' ? 'R$ 100k+' :
                                                                    lead.budget_range === 'D' ? '< R$ 35k' : '---'}
                                                    </span>
                                                </div>

                                                {hasAppointment && (
                                                    <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                                        <div className="flex items-center gap-2 text-amber-500 mb-1">
                                                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                                            <span className="text-xs font-bold uppercase tracking-[0.1em]">Agendado</span>
                                                        </div>
                                                        <p className="text-white text-sm font-medium">
                                                            {appointmentDate?.toLocaleString('pt-BR', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Glass Overlay Glow */}
                                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${lead.budget_range === 'C' ? 'bg-amber-500/5' : 'bg-primary/5'
                                                }`}></div>
                                        </motion.div>
                                    )
                                })}
                            </AnimatePresence>

                            {column.leads.length === 0 && !loading && (
                                <div className="h-32 rounded-3xl border border-dashed border-white/5 flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-gray-700 uppercase tracking-widest">Vazio</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <LeadDetailModal
                lead={selectedLead}
                isOpen={!!selectedLead}
                onClose={() => setSelectedLead(null)}
                onDeleted={fetchLeads}
            />
        </>
    )
}
