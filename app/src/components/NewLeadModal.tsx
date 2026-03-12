import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

interface NewLeadModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export default function NewLeadModal({ isOpen, onClose, onSuccess }: NewLeadModalProps) {
    const { tenantId } = useTenant()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        status: 'morno',
        pipeline_stage: 'new',
        event_type: ''
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase) return
        if (!tenantId) { alert('Tenant não encontrado. Recarregue a página.'); return }
        setLoading(true)

        try {
            const { error } = await supabase
                .from('leads')
                .insert([{ ...formData, tenant_id: tenantId }])

            if (error) throw error
            onSuccess()
            onClose()
            setFormData({ name: '', phone: '', status: 'morno', pipeline_stage: 'new', event_type: '' })
        } catch (err: unknown) {
            console.error('Error creating lead:', err)
            const msg = (err as { message?: string })?.message ?? JSON.stringify(err)
            alert(`Erro: ${msg}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg bg-bg-dark border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl z-10"
                    >
                        <div className="p-5 md:p-8">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h3 className="text-white text-2xl font-heading font-light">Novo Lead</h3>
                                    <p className="text-primary/50 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Cadastro Manual BackStageFy</p>
                                </div>
                                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Nome Completo</label>
                                    <input
                                        required
                                        className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 text-white placeholder-gray-700 focus:outline-none focus:border-primary/40 transition-all"
                                        placeholder="Ex: João Silva"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">WhatsApp (DDD + Número)</label>
                                    <input
                                        required
                                        className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 text-white placeholder-gray-700 focus:outline-none focus:border-primary/40 transition-all font-mono"
                                        placeholder="Ex: 5511999999999"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Interesse</label>
                                        <select
                                            className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-primary/40 transition-all appearance-none"
                                            value={formData.status}
                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        >
                                            <option value="frio" className="bg-bg-dark">Frio</option>
                                            <option value="morno" className="bg-bg-dark">Morno</option>
                                            <option value="quente" className="bg-bg-dark">Quente</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Tipo de Evento</label>
                                        <input
                                            className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 text-white placeholder-gray-700 focus:outline-none focus:border-primary/40 transition-all"
                                            placeholder="Ex: Casamento"
                                            value={formData.event_type}
                                            onChange={e => setFormData({ ...formData, event_type: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full backstagefy-btn-primary py-5 rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                                >
                                    {loading ? (
                                        <div className="size-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined">person_add</span>
                                            Cadastrar Lead
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
