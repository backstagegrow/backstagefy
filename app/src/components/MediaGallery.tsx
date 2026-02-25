import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

interface MediaItem {
    id: string
    url: string
    category: string
    title: string | null
    description: string | null
    ai_description: string | null
    media_type: 'image' | 'video' | 'pdf'
    is_featured: boolean
    created_at: string
}

const CATEGORIES = [
    { id: 'all', label: 'Todos', icon: 'apps' },
    { id: 'fachada', label: 'Fachada', icon: 'storefront' },
    { id: 'led', label: 'LED Wall', icon: 'tv' },
    { id: 'ambientes', label: 'Ambientes', icon: 'meeting_room' },
    { id: 'eventos', label: 'Eventos', icon: 'celebration' },
    { id: 'catering', label: 'Catering', icon: 'restaurant' },
    { id: 'estrutura', label: 'Estrutura', icon: 'construction' },
]

export default function MediaGallery() {
    const [media, setMedia] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)
    const [activeCategory, setActiveCategory] = useState('all')
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [showUploadModal, setShowUploadModal] = useState(false)

    const fetchMedia = useCallback(async () => {
        if (!supabase) return
        setLoading(true)

        try {
            let query = supabase
                .from('gallery_images')
                .select('*')
                .order('is_featured', { ascending: false })
                .order('created_at', { ascending: false })

            if (activeCategory !== 'all') {
                query = query.eq('category', activeCategory)
            }

            const { data, error } = await query
            if (error) throw error
            setMedia(data || [])
        } catch (err) {
            console.error('Error fetching media:', err)
        } finally {
            setLoading(false)
        }
    }, [activeCategory])

    useEffect(() => {
        fetchMedia()
    }, [fetchMedia])

    const toggleFeatured = async (item: MediaItem) => {
        if (!supabase) return

        try {
            await supabase
                .from('gallery_images')
                .update({ is_featured: !item.is_featured })
                .eq('id', item.id)

            fetchMedia()
        } catch (err) {
            console.error('Error toggling featured:', err)
        }
    }

    const updateDescription = async (item: MediaItem, aiDescription: string) => {
        if (!supabase) return

        try {
            await supabase
                .from('gallery_images')
                .update({ ai_description: aiDescription })
                .eq('id', item.id)

            setSelectedItem(null)
            fetchMedia()
        } catch (err) {
            console.error('Error updating description:', err)
        }
    }

    const handleUpload = async (files: FileList, category: string) => {
        if (!supabase || !files.length) return
        setIsUploading(true)

        try {
            for (const file of Array.from(files)) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${category}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`

                // Upload to storage
                const { error: uploadError } = await supabase.storage
                    .from('backstagefy-gallery')
                    .upload(fileName, file)

                if (uploadError) throw uploadError

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('backstagefy-gallery')
                    .getPublicUrl(fileName)

                // Determine media type
                let mediaType: 'image' | 'video' | 'pdf' = 'image'
                if (file.type.startsWith('video/')) mediaType = 'video'
                else if (file.type === 'application/pdf') mediaType = 'pdf'

                // Insert into gallery_images
                await supabase.from('gallery_images').insert({
                    url: publicUrl,
                    category,
                    media_type: mediaType,
                    title: file.name.replace(/\.[^/.]+$/, ''),
                })
            }

            setShowUploadModal(false)
            fetchMedia()
        } catch (err) {
            console.error('Error uploading:', err)
        } finally {
            setIsUploading(false)
        }
    }

    const copyUrl = (url: string) => {
        navigator.clipboard.writeText(url)
    }

    const filteredMedia = media

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-white text-2xl font-heading">Galeria de Mídia</h2>
                    <p className="text-gray-500 text-sm mt-1">Imagens e vídeos para o AI Concierge enviar aos leads</p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="backstagefy-btn-primary"
                >
                    <span className="material-symbols-outlined mr-2">upload</span>
                    Upload
                </button>
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeCategory === cat.id
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Stats */}
            <div className="flex gap-4">
                <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-primary font-bold">{media.length}</span>
                    <span className="text-gray-500 text-sm ml-2">itens</span>
                </div>
                <div className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-amber-400 font-bold">{media.filter(m => m.is_featured).length}</span>
                    <span className="text-gray-500 text-sm ml-2">destaques</span>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="size-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
            ) : filteredMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <span className="material-symbols-outlined text-5xl text-gray-600 mb-4">image</span>
                    <p className="text-gray-500">Nenhuma mídia nesta categoria</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    <AnimatePresence>
                        {filteredMedia.map(item => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="relative group aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/5 hover:border-primary/30 transition-all"
                            >
                                {/* Media Preview */}
                                {item.media_type === 'image' && (
                                    <img
                                        src={item.url}
                                        alt={item.title || ''}
                                        className="w-full h-full object-cover"
                                    />
                                )}
                                {item.media_type === 'video' && (
                                    <div className="w-full h-full flex items-center justify-center bg-black/50">
                                        <span className="material-symbols-outlined text-5xl text-white">play_circle</span>
                                    </div>
                                )}
                                {item.media_type === 'pdf' && (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-900/10 p-4">
                                        <span className="material-symbols-outlined text-5xl text-red-400 mb-2">picture_as_pdf</span>
                                        <p className="text-white/80 text-xs font-medium text-center line-clamp-2 px-2">
                                            {item.title}
                                        </p>
                                    </div>
                                )}

                                {/* Featured Badge */}
                                {item.is_featured && (
                                    <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-500/90 text-black text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">star</span>
                                        Destaque
                                    </div>
                                )}

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                                    <button
                                        onClick={() => toggleFeatured(item)}
                                        className={`size-10 rounded-xl flex items-center justify-center transition-colors ${item.is_featured
                                            ? 'bg-amber-500 text-black'
                                            : 'bg-white/10 text-white hover:bg-amber-500 hover:text-black'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined">star</span>
                                    </button>
                                    <button
                                        onClick={() => setSelectedItem(item)}
                                        className="size-10 rounded-xl bg-white/10 text-white hover:bg-primary hover:text-black transition-colors flex items-center justify-center"
                                    >
                                        <span className="material-symbols-outlined">edit</span>
                                    </button>
                                    <button
                                        onClick={() => copyUrl(item.url)}
                                        className="size-10 rounded-xl bg-white/10 text-white hover:bg-green-500 transition-colors flex items-center justify-center"
                                    >
                                        <span className="material-symbols-outlined">link</span>
                                    </button>
                                </div>

                                {/* Category Label */}
                                <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] uppercase tracking-wider">
                                    {item.category}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Upload Modal */}
            <AnimatePresence>
                {showUploadModal && (
                    <UploadModal
                        onClose={() => setShowUploadModal(false)}
                        onUpload={handleUpload}
                        isUploading={isUploading}
                    />
                )}
            </AnimatePresence>

            {/* Edit Description Modal */}
            <AnimatePresence>
                {selectedItem && (
                    <EditModal
                        item={selectedItem}
                        onClose={() => setSelectedItem(null)}
                        onSave={updateDescription}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// Upload Modal Component
function UploadModal({ onClose, onUpload, isUploading }: {
    onClose: () => void
    onUpload: (files: FileList, category: string) => void
    isUploading: boolean
}) {
    const [category, setCategory] = useState('ambientes')
    const [dragOver, setDragOver] = useState(false)

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) {
            onUpload(e.dataTransfer.files, category)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            onUpload(e.target.files, category)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="relative w-full max-w-lg bg-bg-dark border border-white/10 rounded-3xl p-8"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-white text-xl font-heading mb-6">Upload de Mídia</h3>

                {/* Category Select */}
                <div className="mb-6">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Categoria</label>
                    <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-primary/50 focus:outline-none"
                    >
                        {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                    </select>
                </div>

                {/* Drop Zone */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${dragOver ? 'border-primary bg-primary/10' : 'border-white/10'
                        }`}
                >
                    {isUploading ? (
                        <div className="flex flex-col items-center">
                            <div className="size-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                            <p className="text-gray-400">Uploading...</p>
                        </div>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-5xl text-gray-600 mb-4">cloud_upload</span>
                            <p className="text-gray-400 mb-2">Drag files here or</p>
                            <label className="cursor-pointer text-primary hover:underline">
                                select from computer
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*,video/*,.pdf"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </label>
                        </>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 size-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </motion.div>
        </motion.div>
    )
}

// Edit Modal Component
function EditModal({ item, onClose, onSave }: {
    item: MediaItem
    onClose: () => void
    onSave: (item: MediaItem, description: string) => void
}) {
    const [description, setDescription] = useState(item.ai_description || '')

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="relative w-full max-w-2xl bg-bg-dark border border-white/10 rounded-3xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex">
                    {/* Preview */}
                    <div className="w-1/2 aspect-square bg-black">
                        {item.media_type === 'image' && (
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                        )}
                    </div>

                    {/* Form */}
                    <div className="w-1/2 p-6 flex flex-col">
                        <h3 className="text-white text-lg font-heading mb-4">Editar Descrição para IA</h3>

                        <div className="mb-4">
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Categoria</label>
                            <p className="text-white capitalize">{item.category}</p>
                        </div>

                        <div className="flex-1 mb-4">
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Descrição para IA
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Descreva esta imagem para a IA usar ao enviar para leads..."
                                className="w-full h-32 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 resize-none focus:border-primary/50 focus:outline-none"
                            />
                            <p className="text-[10px] text-gray-600 mt-2">
                                Esta descrição será usada pela IA ao apresentar o espaço para leads.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => onSave(item, description)}
                                className="flex-1 py-3 rounded-xl bg-primary text-black font-bold hover:bg-primary/90"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 size-8 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </motion.div>
        </motion.div>
    )
}
