import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

interface LeadCardProps {
    lead: {
        id: number
        name: string
        budget: string
        status: string
        project: string
        score: number
        isHot: boolean
        lastContact: string
        avatar?: string
        image?: string
    }
}

const LeadCard = ({ lead }: LeadCardProps) => {
    return (
        <motion.div
            layoutId={lead.id.toString()}
            className="kanban-card p-5 group cursor-pointer border-l-transparent"
        >
            <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                    <div
                        className="size-12 rounded-2xl bg-cover bg-center ring-1 ring-white/10 shadow-lg"
                        style={{ backgroundImage: `url("${lead.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + lead.id}")` }}
                    ></div>
                    <div>
                        <h4 className="text-white font-bold text-base tracking-tight">{lead.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="size-1.5 bg-primary rounded-full"></span>
                            <p className="text-primary text-[10px] font-bold uppercase tracking-widest leading-tight line-clamp-1">{lead.budget}</p>
                        </div>
                    </div>
                </div>
                {lead.isHot && (
                    <div className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-[9px] text-primary font-bold uppercase">
                        Urgent
                    </div>
                )}
                {!lead.isHot && (
                    <button className="text-gray-600 group-hover:text-white transition-colors">
                        <span className="material-symbols-outlined">more_vert</span>
                    </button>
                )}
            </div>

            {lead.image && (
                <div
                    className="h-40 w-full rounded-2xl bg-cover bg-center relative mb-5 group-hover:scale-[1.02] transition-transform duration-500"
                    style={{ backgroundImage: `url("${lead.image}")` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent rounded-2xl"></div>
                    <div className="absolute bottom-3 left-4">
                        <p className="text-white text-xs font-semibold tracking-wide">{lead.project}</p>
                    </div>
                </div>
            )}

            {!lead.image && (
                <div className="mb-4">
                    <p className="text-white text-xs font-semibold tracking-wide">{lead.project}</p>
                </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-gray-500">
                    <span className="material-symbols-outlined text-sm">calendar_clock</span>
                    <span className="text-[10px] font-bold uppercase">{lead.lastContact}</span>
                </div>
                {lead.isHot ? (
                    <div className="size-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[9px] text-white">VIP</div>
                ) : (
                    <span className="text-primary/70 text-[10px] font-bold bg-primary/5 px-2.5 py-1 rounded-md border border-primary/10 uppercase tracking-widest">New</span>
                )}
            </div>
        </motion.div>
    )
}

export default function LeadPipeline() {
    const [columns, setColumns] = useState([
        { status: 'NEW INQUIRIES', id: 'new', count: 0, color: 'bg-blue-500', progress: 'w-full', leads: [] as any[] },
        { status: 'SITE VISIT', id: 'site_visit', count: 0, color: 'bg-purple-500', progress: 'w-0', leads: [] as any[] },
        { status: 'PROPOSAL', id: 'proposal', count: 0, color: 'bg-green-500', progress: 'w-0', leads: [] as any[] },
        { status: 'BOOKED', id: 'booked', count: 0, color: 'bg-amber-500', progress: 'w-0', leads: [] as any[] },
    ]);

    useEffect(() => {
        fetchLeads();

        // Realtime Subscription
        const channel = supabase
            ?.channel('pipeline-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
                fetchLeads();
            })
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    const fetchLeads = async () => {
        if (!supabase) return;

        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching leads:', error);
            return;
        }

        const newColumns = [
            { status: 'NEW INQUIRIES', id: 'new', count: 0, color: 'bg-blue-500', progress: 'w-full', leads: [] as any[] },
            { status: 'SITE VISIT', id: 'site_visit', count: 0, color: 'bg-purple-500', progress: 'w-0', leads: [] as any[] },
            { status: 'PROPOSAL', id: 'proposal', count: 0, color: 'bg-green-500', progress: 'w-0', leads: [] as any[] },
            { status: 'BOOKED', id: 'booked', count: 0, color: 'bg-amber-500', progress: 'w-0', leads: [] as any[] },
        ];

        data.forEach(lead => {
            // Map DB pipeline_stage to Column Index
            let columnIndex = 0;
            if (lead.pipeline_stage === 'site_visit') columnIndex = 1;
            else if (lead.pipeline_stage === 'proposal') columnIndex = 2;
            else if (lead.pipeline_stage === 'booked') columnIndex = 3;

            // Transform DB row to Card Props
            const cardData = {
                id: lead.id,
                name: lead.name || 'Unnamed Lead',
                budget: lead.budget || 'Undisclosed',
                status: lead.status === 'quente' ? 'Active' : 'Pending',
                project: lead.metadata?.project || lead.event_type || 'New Event Inquiry',
                score: 80, // Dynamic score todo
                isHot: lead.status === 'quente',
                lastContact: new Date(lead.created_at).toLocaleDateString(),
                image: lead.metadata?.image,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${lead.name}`
            };

            newColumns[columnIndex].leads.push(cardData);
        });

        // Update counts
        newColumns.forEach(col => col.count = col.leads.length);
        setColumns(newColumns);
    };

    return (
        <div className="flex gap-8 overflow-x-auto pb-6 h-full items-start">
            {columns.map((column) => (
                <div key={column.status} className="min-w-[320px] max-w-[320px] flex flex-col gap-6 flex-shrink-0">
                    {/* Header with Progress Bar */}
                    <div className="space-y-3 px-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`size-2 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.4)] ${column.color}`}></div>
                                <h3 className="text-gray-200 font-heading text-xs uppercase tracking-[0.15em]">{column.status}</h3>
                            </div>
                            <span className="text-gray-500 text-xs font-bold">{column.count} Leads</span>
                        </div>
                        <div className="progress-bar-glow">
                            <div className={`progress-bar-fill ${column.progress} ${column.status === 'Proposal' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : ''}`}></div>
                        </div>
                    </div>

                    {/* Cards Column */}
                    <div className="flex flex-col gap-4">
                        {column.leads.map((lead) => (
                            <LeadCard key={lead.id} lead={lead} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
