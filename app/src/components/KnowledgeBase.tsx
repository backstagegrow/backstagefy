import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTenant } from '../context/TenantContext'
import { supabase } from '../lib/supabase'

type Category = 'company_info' | 'products' | 'faq' | 'documents' | 'media'

interface KnowledgeDoc {
    id: string
    tenant_id: string
    title: string
    description: string | null
    content: string | null
    category: Category
    source_type: string
    storage_path: string | null
    status: string
    chunk_count: number
    extra: Record<string, any>
    original_filename: string | null
    file_size: number | null
    mime_type: string | null
    created_at: string
}

interface CompanyInfo {
    company_name: string
    address: string
    phone: string
    hours: string
    social: string
    website: string
    description: string
}

const CONTENT_CATEGORIES: { value: Category; label: string; icon: string; color: string; desc: string }[] = [
    { value: 'products', label: 'Produtos & Serviços', icon: 'inventory_2', color: 'text-blue-400', desc: 'Catálogo com preços e diferenciais' },
    { value: 'faq', label: 'FAQ / SAC', icon: 'quiz', color: 'text-amber-400', desc: 'Perguntas frequentes e respostas oficiais' },
    { value: 'documents', label: 'Documentos', icon: 'description', color: 'text-rose-400', desc: 'PDFs, políticas, contratos e manuais' },
    { value: 'media', label: 'Mídias', icon: 'perm_media', color: 'text-violet-400', desc: 'Imagens institucionais, logos e catálogo visual' },
]

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pendente', color: 'text-white/40 bg-white/5 border-white/10', icon: 'schedule' },
    processing: { label: 'Indexando...', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: 'progress_activity' },
    ready: { label: 'Indexado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: 'check_circle' },
    error: { label: 'Erro', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: 'error' },
}

const COMPANY_FIELDS = [
    { key: 'company_name', label: 'Nome da Empresa', icon: 'business', placeholder: 'Minha Empresa Ltda.' },
    { key: 'address', label: 'Endereço', icon: 'location_on', placeholder: 'Rua, nº, bairro — Cidade/UF' },
    { key: 'phone', label: 'Telefone', icon: 'call', placeholder: '(11) 99999-9999' },
    { key: 'hours', label: 'Horário', icon: 'schedule', placeholder: 'Seg–Sex: 9h–18h' },
    { key: 'social', label: 'Redes Sociais', icon: 'share', placeholder: '@empresa no Instagram, Facebook...' },
    { key: 'website', label: 'Website', icon: 'language', placeholder: 'https://www.empresa.com.br' },
    { key: 'description', label: 'Sobre a Empresa', icon: 'info', placeholder: 'Descreva sua empresa, missão e diferenciais...' },
]

export default function KnowledgeBase() {
    const { tenant } = useTenant()
    const tenantId = tenant?.id

    const [docs, setDocs] = useState<KnowledgeDoc[]>([])
    const [loading, setLoading] = useState(true)
    const [activeCategory, setActiveCategory] = useState<Category>('company_info')
    const [showAddModal, setShowAddModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingDoc, setEditingDoc] = useState<KnowledgeDoc | null>(null)

    // Company info state (synced with tenant.settings)
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
        company_name: '', address: '', phone: '', hours: '', social: '', website: '', description: ''
    })
    const [companyEditing, setCompanyEditing] = useState(false)
    const [companySaving, setCompanySaving] = useState(false)

    // Form state for content categories
    const [formTitle, setFormTitle] = useState('')
    const [formDescription, setFormDescription] = useState('')
    const [formContent, setFormContent] = useState('')
    const [formExtra, setFormExtra] = useState<Record<string, any>>({})
    const [formFile, setFormFile] = useState<File | null>(null)

    // Load company info from tenant settings
    useEffect(() => {
        if (!tenant) return
        const settings = tenant.settings || {}
        setCompanyInfo({
            company_name: tenant.name || '',
            address: settings.address || '',
            phone: settings.phone || '',
            hours: settings.hours || '',
            social: settings.social || '',
            website: settings.website || '',
            description: settings.description || '',
        })
    }, [tenant])

    const fetchDocs = useCallback(async () => {
        if (!supabase || !tenantId) return
        setLoading(true)
        const { data } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
        setDocs((data as KnowledgeDoc[]) || [])
        setLoading(false)
    }, [tenantId])

    useEffect(() => { fetchDocs() }, [fetchDocs])

    const filteredDocs = docs.filter(d => d.category === activeCategory)
    const totalChunks = docs.reduce((sum, d) => sum + (d.chunk_count || 0), 0)
    const readyDocs = docs.filter(d => d.status === 'ready').length
    const lastUpdate = docs.length > 0 ? new Date(docs[0].created_at).toLocaleDateString('pt-BR') : '—'
    const companyFilled = Object.values(companyInfo).filter(v => v.trim()).length

    // Save company info to tenant.settings
    const handleSaveCompany = async () => {
        if (!supabase || !tenantId) return
        setCompanySaving(true)
        try {
            const currentSettings = tenant?.settings || {}
            const updatedSettings = {
                ...currentSettings,
                address: companyInfo.address.trim(),
                phone: companyInfo.phone.trim(),
                hours: companyInfo.hours.trim(),
                social: companyInfo.social.trim(),
                website: companyInfo.website.trim(),
                description: companyInfo.description.trim(),
            }

            await supabase.from('tenants').update({
                name: companyInfo.company_name.trim() || tenant?.name,
                settings: updatedSettings,
            }).eq('id', tenantId)

            // Auto-create or update the institutional knowledge document
            const institutionalContent = [
                `# ${companyInfo.company_name}`,
                companyInfo.description ? `\n${companyInfo.description}` : '',
                companyInfo.address ? `\n## Localização\n${companyInfo.address}` : '',
                companyInfo.phone ? `\n## Contato\nTelefone: ${companyInfo.phone}` : '',
                companyInfo.hours ? `\n## Horário de Funcionamento\n${companyInfo.hours}` : '',
                companyInfo.social ? `\n## Redes Sociais\n${companyInfo.social}` : '',
                companyInfo.website ? `\n## Website\n${companyInfo.website}` : '',
            ].filter(Boolean).join('\n')

            // Check if institutional doc already exists
            const { data: existing } = await supabase
                .from('knowledge_documents')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('category', 'company_info')
                .eq('title', 'Dados Institucionais')
                .single()

            if (existing) {
                await supabase.from('knowledge_documents').update({
                    content: institutionalContent,
                    status: 'pending',
                    chunk_count: 0,
                }).eq('id', existing.id)
                supabase.functions.invoke('process-knowledge', { body: { documentId: existing.id } }).catch(console.error)
            } else {
                const { data: inserted } = await supabase.from('knowledge_documents').insert({
                    tenant_id: tenantId,
                    title: 'Dados Institucionais',
                    description: 'Informações base da empresa — gerado automaticamente',
                    content: institutionalContent,
                    category: 'company_info',
                    source_type: 'text',
                    status: 'pending',
                }).select().single()
                if (inserted) {
                    supabase.functions.invoke('process-knowledge', { body: { documentId: inserted.id } }).catch(console.error)
                }
            }

            setCompanyEditing(false)
            fetchDocs()
        } catch (err: any) {
            alert('Erro ao salvar: ' + (err.message || 'Tente novamente.'))
        } finally {
            setCompanySaving(false)
        }
    }

    const resetForm = () => {
        setFormTitle('')
        setFormDescription('')
        setFormContent('')
        setFormExtra({})
        setFormFile(null)
        setEditingDoc(null)
    }

    const openAdd = () => {
        resetForm()
        setShowAddModal(true)
    }

    const openEdit = (doc: KnowledgeDoc) => {
        setEditingDoc(doc)
        setFormTitle(doc.title)
        setFormDescription(doc.description || '')
        setFormContent(doc.content || '')
        setFormExtra(doc.extra || {})
        setShowAddModal(true)
    }

    const handleSave = async () => {
        if (!supabase || !tenantId || !formTitle.trim()) return
        setSaving(true)

        try {
            let storagePath: string | null = null
            let mimeType: string | null = null
            let fileSize: number | null = null

            if (formFile) {
                const ext = formFile.name.split('.').pop()
                const path = `${tenantId}/${Date.now()}.${ext}`
                const { error: uploadErr } = await supabase.storage
                    .from('knowledge-files')
                    .upload(path, formFile)
                if (uploadErr) throw uploadErr
                storagePath = path
                mimeType = formFile.type
                fileSize = formFile.size
            }

            const sourceType = formFile ? 'file' : (activeCategory === 'faq' ? 'faq' : 'text')

            const payload = {
                tenant_id: tenantId,
                title: formTitle.trim(),
                description: formDescription.trim() || null,
                content: formContent.trim() || null,
                category: activeCategory,
                source_type: sourceType,
                extra: Object.keys(formExtra).length > 0 ? formExtra : {},
                original_filename: formFile?.name || null,
                storage_path: storagePath,
                mime_type: mimeType,
                file_size: fileSize,
                status: activeCategory === 'media' ? 'ready' : 'pending',
            }

            if (editingDoc) {
                await supabase.from('knowledge_documents').update(payload).eq('id', editingDoc.id)
            } else {
                const { data: inserted } = await supabase.from('knowledge_documents').insert(payload).select().single()
                if (inserted && (formContent.trim() || storagePath)) {
                    supabase.functions.invoke('process-knowledge', { body: { documentId: inserted.id } }).catch(console.error)
                }
            }

            setShowAddModal(false)
            resetForm()
            fetchDocs()
        } catch (err: any) {
            alert('Erro ao salvar: ' + (err.message || 'Tente novamente.'))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!supabase || !confirm('Excluir este item e todos os seus chunks indexados?')) return
        await supabase.from('knowledge_documents').delete().eq('id', id)
        fetchDocs()
    }

    const handleReindex = async (doc: KnowledgeDoc) => {
        if (!supabase) return
        await supabase.from('knowledge_documents').update({ status: 'pending', chunk_count: 0 }).eq('id', doc.id)
        supabase.functions.invoke('process-knowledge', { body: { documentId: doc.id } }).catch(console.error)
        fetchDocs()
    }

    const formatBytes = (bytes: number | null) => {
        if (!bytes) return '—'
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / 1048576).toFixed(1) + ' MB'
    }

    const getPublicUrl = (storagePath: string | null | undefined) => {
        if (!storagePath || !supabase) return null
        const { data } = supabase.storage.from('knowledge-files').getPublicUrl(storagePath)
        return data?.publicUrl || null
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total de Documentos', value: docs.length, icon: 'folder_open', color: 'text-primary' },
                    { label: 'Chunks Indexados', value: totalChunks, icon: 'data_array', color: 'text-emerald-400' },
                    { label: 'Prontos para IA', value: readyDocs, icon: 'check_circle', color: 'text-amber-400' },
                    { label: 'Última Atualização', value: lastUpdate, icon: 'update', color: 'text-blue-400' },
                ].map((card, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className={`material-symbols-outlined text-lg ${card.color}`}>{card.icon}</span>
                        </div>
                        <p className="text-white text-2xl font-heading font-light">{card.value}</p>
                        <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold mt-1">{card.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Two-section layout */}
            <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">

                {/* LEFT — Institutional Card (auto-populated from onboarding) */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden h-fit"
                >
                    {/* Card Header */}
                    <div className="p-5 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-emerald-400">business</span>
                            </div>
                            <div>
                                <h3 className="text-white text-sm font-semibold">Dados Institucionais</h3>
                                <p className="text-white/30 text-[9px] uppercase tracking-widest font-bold flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Sincronizado com Onboarding
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setCompanyEditing(!companyEditing)}
                            className={`size-8 rounded-lg border flex items-center justify-center transition-all ${companyEditing
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'
                                }`}
                            title="Editar dados da empresa"
                        >
                            <span className="material-symbols-outlined text-sm">{companyEditing ? 'close' : 'edit'}</span>
                        </button>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 space-y-4">
                        {COMPANY_FIELDS.map(field => (
                            <div key={field.key}>
                                <label className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5 block">
                                    <span className="material-symbols-outlined text-[11px] text-white/20">{field.icon}</span>
                                    {field.label}
                                </label>
                                {companyEditing ? (
                                    field.key === 'description' ? (
                                        <textarea
                                            value={(companyInfo as any)[field.key] || ''}
                                            onChange={e => setCompanyInfo({ ...companyInfo, [field.key]: e.target.value })}
                                            rows={3}
                                            className="w-full bg-black/30 border border-white/10 text-white py-2.5 px-3.5 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-xs outline-none resize-none"
                                            placeholder={field.placeholder}
                                        />
                                    ) : (
                                        <input
                                            value={(companyInfo as any)[field.key] || ''}
                                            onChange={e => setCompanyInfo({ ...companyInfo, [field.key]: e.target.value })}
                                            className="w-full bg-black/30 border border-white/10 text-white py-2.5 px-3.5 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-xs outline-none"
                                            placeholder={field.placeholder}
                                        />
                                    )
                                ) : (
                                    <p className={`text-xs leading-relaxed ${(companyInfo as any)[field.key] ? 'text-white/70' : 'text-white/20 italic'}`}>
                                        {(companyInfo as any)[field.key] || 'Não preenchido'}
                                    </p>
                                )}
                            </div>
                        ))}

                        {companyEditing && (
                            <button
                                onClick={handleSaveCompany}
                                disabled={companySaving}
                                className="w-full backstagefy-btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30"
                            >
                                <span className="material-symbols-outlined text-sm">{companySaving ? 'progress_activity' : 'save'}</span>
                                {companySaving ? 'Salvando e Indexando...' : 'Salvar e Indexar'}
                            </button>
                        )}

                        {/* Completeness indicator */}
                        <div className="pt-3 border-t border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Completude</span>
                                <span className="text-[9px] text-primary font-mono font-bold">{Math.round((companyFilled / COMPANY_FIELDS.length) * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-700"
                                    style={{ width: `${(companyFilled / COMPANY_FIELDS.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* RIGHT — Content Categories */}
                <div className="space-y-6">
                    {/* Category Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {CONTENT_CATEGORIES.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setActiveCategory(cat.value)}
                                className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${activeCategory === cat.value
                                    ? 'bg-primary/10 border-primary/30 text-primary shadow-[0_0_20px_rgba(var(--color-primary),0.08)]'
                                    : 'bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70 hover:border-white/15'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-base ${activeCategory === cat.value ? 'text-primary' : cat.color}`}>{cat.icon}</span>
                                {cat.label}
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${activeCategory === cat.value ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/30'}`}>
                                    {docs.filter(d => d.category === cat.value).length}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Category Header + Add Button */}
                    <div className="flex items-center justify-between">
                        <p className="text-white/40 text-xs">
                            {CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.desc}
                        </p>
                        <button
                            onClick={openAdd}
                            className="backstagefy-btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
                        >
                            <span className="material-symbols-outlined text-sm">add_circle</span>
                            Adicionar
                        </button>
                    </div>

                    {/* Content List */}
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {filteredDocs.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center justify-center py-16 text-center"
                                >
                                    <div className="size-16 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
                                        <span className={`material-symbols-outlined text-2xl ${CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.color || 'text-white/20'}`}>
                                            {CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.icon}
                                        </span>
                                    </div>
                                    <p className="text-white/50 text-sm mb-1">Nenhum conteúdo nesta categoria</p>
                                    <p className="text-white/25 text-xs max-w-sm">Clique em "Adicionar" para ensinar a IA.</p>
                                </motion.div>
                            ) : (
                                filteredDocs.map((doc, i) => {
                                    const status = STATUS_MAP[doc.status] || STATUS_MAP.pending
                                    return (
                                        <motion.div
                                            key={doc.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="group p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] hover:border-white/10 transition-all"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                                    <div className={`size-10 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center shrink-0 ${CONTENT_CATEGORIES.find(c => c.value === doc.category)?.color || 'text-white/30'}`}>
                                                        <span className="material-symbols-outlined text-lg">
                                                            {doc.source_type === 'file' ? 'attach_file' : CONTENT_CATEGORIES.find(c => c.value === doc.category)?.icon || 'article'}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-white text-sm font-semibold truncate">{doc.title}</h4>
                                                        {doc.description && (
                                                            <p className="text-white/40 text-xs mt-1 line-clamp-1">{doc.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-3 mt-2.5">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${status.color}`}>
                                                                <span className={`material-symbols-outlined text-[10px] ${doc.status === 'processing' ? 'animate-spin' : ''}`}>{status.icon}</span>
                                                                {status.label}
                                                            </span>
                                                            {doc.chunk_count > 0 && (
                                                                <span className="text-white/20 text-[9px] font-mono">{doc.chunk_count} chunks</span>
                                                            )}
                                                            {doc.file_size && (
                                                                <span className="text-white/20 text-[9px] font-mono">{formatBytes(doc.file_size)}</span>
                                                            )}
                                                            <span className="text-white/15 text-[9px]">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {/* Image thumbnail for media */}
                                                    {doc.category === 'media' && doc.mime_type?.startsWith('image/') && doc.storage_path && (
                                                        <div className="size-16 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                                                            <img
                                                                src={getPublicUrl(doc.storage_path) || ''}
                                                                alt={doc.title}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => openEdit(doc)} className="size-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all" title="Editar">
                                                            <span className="material-symbols-outlined text-sm">edit</span>
                                                        </button>
                                                        <button onClick={() => handleReindex(doc)} className="size-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Reindexar">
                                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                                        </button>
                                                        <button onClick={() => handleDelete(doc.id)} className="size-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Excluir">
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal (for content categories only) */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => { setShowAddModal(false); resetForm() }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between p-6 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`size-10 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center ${CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.color}`}>
                                        <span className="material-symbols-outlined">{CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.icon}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-white text-lg font-heading">{editingDoc ? 'Editar' : 'Novo'} — {CONTENT_CATEGORIES.find(c => c.value === activeCategory)?.label}</h3>
                                        <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">Conteúdo Estratégico da IA</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowAddModal(false); resetForm() }} className="size-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Título *</label>
                                    <input
                                        value={formTitle}
                                        onChange={e => setFormTitle(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 text-white py-3 px-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-sm outline-none"
                                        placeholder="Ex: Política de Troca e Devolução..."
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Descrição</label>
                                    <input
                                        value={formDescription}
                                        onChange={e => setFormDescription(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 text-white py-3 px-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-sm outline-none"
                                        placeholder="Breve descrição do conteúdo..."
                                    />
                                </div>

                                {activeCategory === 'products' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { key: 'price', label: 'Preço', placeholder: 'R$ 199,90' },
                                            { key: 'differentials', label: 'Diferenciais', placeholder: 'Garantia, frete grátis...' },
                                        ].map(f => (
                                            <div key={f.key}>
                                                <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">{f.label}</label>
                                                <input
                                                    value={formExtra[f.key] || ''}
                                                    onChange={e => setFormExtra({ ...formExtra, [f.key]: e.target.value })}
                                                    className="w-full bg-black/30 border border-white/10 text-white py-3 px-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-sm outline-none"
                                                    placeholder={f.placeholder}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeCategory === 'faq' && (
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Categoria do FAQ</label>
                                        <select
                                            value={formExtra.faq_category || 'geral'}
                                            onChange={e => setFormExtra({ ...formExtra, faq_category: e.target.value })}
                                            className="w-full bg-[#0a0a0a] border border-white/10 text-white py-3 px-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-sm outline-none"
                                        >
                                            <option value="geral" className="bg-[#0a0a0a] text-white/90">Geral</option>
                                            <option value="venda" className="bg-[#0a0a0a] text-white/90">Vendas</option>
                                            <option value="pos-venda" className="bg-[#0a0a0a] text-white/90">Pós-venda</option>
                                            <option value="suporte" className="bg-[#0a0a0a] text-white/90">Suporte Técnico</option>
                                        </select>
                                    </div>
                                )}

                                {['products', 'faq', 'documents'].includes(activeCategory) && (
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                            {activeCategory === 'faq' ? 'Resposta Oficial' : 'Conteúdo Textual'}
                                        </label>
                                        <textarea
                                            value={formContent}
                                            onChange={e => setFormContent(e.target.value)}
                                            rows={6}
                                            className="w-full bg-[#0a0a0a] border border-white/10 text-[#d4d4d4] p-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary text-sm resize-none font-mono leading-relaxed outline-none"
                                            placeholder={activeCategory === 'faq'
                                                ? 'Digite aqui a resposta oficial para esta pergunta...'
                                                : 'Cole ou digite o conteúdo que a IA deve aprender...'
                                            }
                                        />
                                    </div>
                                )}

                                {['documents', 'media'].includes(activeCategory) && (
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                            {activeCategory === 'media' ? 'Upload de Imagem' : 'Upload de Arquivo (PDF, TXT, DOCX)'}
                                        </label>
                                        <label className="flex flex-col items-center justify-center p-8 bg-black/20 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group">
                                            <span className="material-symbols-outlined text-3xl text-white/20 group-hover:text-primary/60 mb-2">
                                                {activeCategory === 'media' ? 'add_photo_alternate' : 'upload_file'}
                                            </span>
                                            <p className="text-white/40 text-xs group-hover:text-white/60">
                                                {formFile ? formFile.name : 'Clique para selecionar ou arraste o arquivo'}
                                            </p>
                                            {formFile && (
                                                <p className="text-white/20 text-[10px] mt-1">{formatBytes(formFile.size)}</p>
                                            )}
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept={activeCategory === 'media' ? 'image/*' : '.pdf,.txt,.docx,.doc,.xlsx,.csv'}
                                                onChange={e => setFormFile(e.target.files?.[0] || null)}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/5">
                                <button
                                    onClick={() => { setShowAddModal(false); resetForm() }}
                                    className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !formTitle.trim()}
                                    className="backstagefy-btn-primary px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-30"
                                >
                                    <span className="material-symbols-outlined text-sm">{saving ? 'progress_activity' : 'save'}</span>
                                    {saving ? 'Salvando...' : (editingDoc ? 'Atualizar' : 'Salvar e Indexar')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
