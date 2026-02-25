import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}

interface Lead {
    id: string
    name: string | null
    phone: string
    company_name: string | null
    corporate_email: string | null
    budget_range: string | null
    status: string
    pipeline_stage: string
    created_at: string
    venue_tours?: {
        visit_date: string
        visit_time: string
        status: string
    }[]
}

interface LeadDetailModalProps {
    lead: Lead | null
    isOpen: boolean
    onClose: () => void
    onDeleted?: () => void
}

export default function LeadDetailModal({ lead, isOpen, onClose, onDeleted }: LeadDetailModalProps) {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
    const [loading, setLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    useEffect(() => {
        if (lead && isOpen) {
            fetchChatHistory()
            setShowDeleteConfirm(false)
        }
    }, [lead, isOpen])

    const fetchChatHistory = async () => {
        if (!lead || !supabase) return
        setLoading(true)

        try {
            const { data, error } = await supabase
                .from('chat_history')
                .select('id, role, content, created_at')
                .eq('lead_id', lead.id)
                .order('created_at', { ascending: true })

            if (error) throw error
            setChatHistory(data || [])
        } catch (err) {
            console.error('Error fetching chat history:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteLead = async () => {
        if (!lead || !supabase) return
        setIsDeleting(true)

        try {
            // Delete related data first (Cascade logic manual safety)
            await supabase.from('chat_history').delete().eq('lead_id', lead.id)
            await supabase.from('appointments').delete().eq('lead_id', lead.id)
            await supabase.from('venue_tours').delete().eq('lead_id', lead.id)

            // Finally delete the lead
            const { error } = await supabase.from('leads').delete().eq('id', lead.id)

            if (error) throw error

            if (onDeleted) onDeleted()
            onClose()
        } catch (err) {
            console.error('Error deleting lead:', err)
            alert('Erro ao excluir lead. Tente novamente.')
        } finally {
            setIsDeleting(false)
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const getLastInteraction = () => {
        if (chatHistory.length === 0) return 'Sem interações'
        const lastMsg = chatHistory[chatHistory.length - 1]
        return formatDate(lastMsg.created_at)
    }

    const openWhatsApp = () => {
        if (lead?.phone) {
            window.open(`https://wa.me/${lead.phone}`, '_blank')
        }
    }

    if (!isOpen || !lead) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

                {/* Modal */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', duration: 0.5 }}
                    className="relative w-full max-w-4xl max-h-[85vh] bg-bg-dark border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-white/5 bg-gradient-to-r from-primary/5 to-transparent">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary text-2xl">person</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-white text-2xl font-heading font-light">
                                            {lead.name || lead.company_name || lead.phone}
                                        </h2>
                                        {lead.budget_range === 'C' && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">
                                                <span className="material-symbols-outlined text-[14px]">star</span>
                                                VIP
                                            </span>
                                        )}
                                        {lead.budget_range === 'B' && (
                                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">
                                                PRIO
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-500 text-sm mt-1">{lead.phone}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${lead.status === 'quente' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    lead.status === 'morno' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                        'bg-gray-500/10 text-gray-400 border border-white/10'
                                    }`}>
                                    {lead.status || 'Novo'}
                                </span>

                                {showDeleteConfirm ? (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleDeleteLead}
                                            disabled={isDeleting}
                                            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                                        >
                                            {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="size-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center transition-colors group"
                                        title="Excluir Lead e Histórico"
                                    >
                                        <span className="material-symbols-outlined text-red-500/60 group-hover:text-red-500">delete</span>
                                    </button>
                                )}

                                <div className="w-px h-6 bg-white/10 mx-2"></div>

                                <button onClick={onClose} className="size-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-gray-400">close</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex h-[calc(85vh-100px)]">
                        {/* Left: Lead Info */}
                        <div className="w-80 border-r border-white/5 p-6 space-y-4 overflow-y-auto">
                            <h3 className="text-xs font-bold text-primary/60 uppercase tracking-widest mb-4">Informações</h3>

                            <div className="space-y-3">
                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Empresa</p>
                                    <p className="text-white font-medium">{lead.company_name || 'Não informado'}</p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Email</p>
                                    <p className="text-white font-medium truncate">{lead.corporate_email || 'Não informado'}</p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Qualificação AI</p>
                                    <p className={`font-bold ${lead.budget_range === 'C' ? 'text-amber-500' :
                                        lead.budget_range === 'B' ? 'text-primary' :
                                            'text-white'
                                        }`}>
                                        {lead.budget_range === 'C' ? 'Tier VIP (+R$100k)' :
                                            lead.budget_range === 'B' ? 'Tier Alto (R$60k-R$100k)' :
                                                lead.budget_range === 'A' ? 'Tier Médio (R$35k-R$60k)' :
                                                    'Abaixo de R$35k'}
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Última Interação</p>
                                    <p className="text-white font-medium">{getLastInteraction()}</p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Etapa</p>
                                    <p className="text-white font-medium capitalize">{lead.pipeline_stage?.replace('_', ' ') || 'Nova'}</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-white/5">
                                <button
                                    onClick={openWhatsApp}
                                    className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-500/20 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">chat</span>
                                    Abrir WhatsApp
                                </button>
                            </div>
                        </div>

                        {/* Right: Chat History */}
                        <div className="flex-1 flex flex-col">
                            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-primary/60 uppercase tracking-widest">Histórico de Conversas</h3>
                                <span className="text-xs text-gray-500">{chatHistory.length} mensagens</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="size-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    </div>
                                ) : chatHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <span className="material-symbols-outlined text-4xl text-gray-600 mb-3">forum</span>
                                        <p className="text-gray-500">Nenhuma conversa registrada</p>
                                    </div>
                                ) : (
                                    chatHistory.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[80%] ${msg.role === 'user'
                                                ? 'bg-primary/10 border-primary/20'
                                                : 'bg-white/5 border-white/10'
                                                } border rounded-2xl p-4`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`size-5 rounded-full flex items-center justify-center text-[10px] ${msg.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                        {msg.role === 'user' ? '👤' : '🤖'}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        {msg.role === 'user' ? 'Lead' : 'Haus AI'} • {formatDate(msg.created_at)}
                                                    </span>
                                                </div>
                                                <p className="text-white text-sm whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
