import { useState, useEffect } from 'react'
import { Session } from '@supabase/supabase-js'
import { useKnowledgeUnlock } from '../lib/useKnowledgeUnlock'

interface SidebarProps {
    activeTab: string
    onTabChange: (tab: string) => void
    session: Session | null
    onLogout: () => void
    isOpen?: boolean
    onClose?: () => void
}

export default function Sidebar({ activeTab, onTabChange, session, onLogout, isOpen, onClose }: SidebarProps) {
    const { unlocked: funnelUnlocked, filledCount, totalCount } = useKnowledgeUnlock()

    const menuItems = [
        { id: 'dashboard', icon: 'dashboard', label: 'Painel Geral' },
        { id: 'leads', icon: 'groups', label: 'Pipeline de Leads' },
        { id: 'agents', icon: 'smart_toy', label: 'Meus Agentes' },
        { id: 'whatsapp', icon: 'chat', label: 'WhatsApp & Canais' },
        { id: 'knowledge', icon: 'menu_book', label: 'Base de Conhecimento' },
        { id: 'funnel', icon: 'filter_alt', label: 'Editor de Funil' },
        { id: 'sales', icon: 'store', label: 'Vendas & Plataformas' },
        { id: 'broadcast', icon: 'campaign', label: 'Campanhas', badge: 'Em Breve' },
        { id: 'viewings', icon: 'calendar_month', label: 'Agenda' },
        { id: 'billing', icon: 'credit_card', label: 'Plano & Uso' },
    ] as const

    const [gcalConnected, setGcalConnected] = useState(() => localStorage.getItem('gcal_connected') === '1')

    useEffect(() => {
        const onStorage = () => setGcalConnected(localStorage.getItem('gcal_connected') === '1')
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const handleTabChange = (id: string) => {
        // Redirect locked funnel to knowledge base
        if (id === 'funnel' && !funnelUnlocked) {
            onTabChange('knowledge')
            onClose?.()
            return
        }
        onTabChange(id)
        onClose?.()
    }

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 md:w-80 flex flex-col bg-black/95 lg:bg-black/40 backdrop-blur-2xl border-r border-white/[0.03] h-screen overflow-hidden
                transform transition-transform duration-300 ease-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:relative lg:translate-x-0 lg:flex-shrink-0
            `}>
                {/* Logo Section */}
                <div className="p-6 pb-8 md:p-10 md:pb-16 flex items-center justify-between">
                    <div className="flex flex-col">
                        <h1 className="text-white text-2xl md:text-3xl font-heading font-light tracking-tighter uppercase">BackStageFy</h1>
                        <p className="text-primary/40 text-[9px] font-bold tracking-[0.3em] uppercase mt-1">SaaS Platform</p>
                    </div>
                    {/* Close button (mobile only) */}
                    <button
                        onClick={onClose}
                        className="lg:hidden size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 md:px-6 space-y-1 md:space-y-2 overflow-y-auto scrollbar-hide">
                    {menuItems.map((item) => {
                        const isActive = activeTab === item.id
                        const hasBadge = 'badge' in item && item.badge
                        const isFunnelLocked = item.id === 'funnel' && !funnelUnlocked
                        return (
                            <button
                                key={item.id}
                                onClick={() => !hasBadge && handleTabChange(item.id)}
                                className={`w-full group flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-2xl transition-all duration-300 relative ${hasBadge || isFunnelLocked
                                    ? 'text-gray-600 cursor-pointer border border-transparent'
                                    : isActive
                                        ? 'bg-primary/5 text-primary border border-primary/20'
                                        : 'text-gray-500 hover:text-white hover:bg-white/[0.02] border border-transparent'
                                    }`}
                                title={isFunnelLocked ? 'Preencha ao menos 1 item em cada categoria da Base de Conhecimento para desbloquear' : undefined}
                            >
                                {isActive && !hasBadge && !isFunnelLocked && <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full shadow-primary"></div>}
                                <span
                                    className={`material-symbols-outlined text-xl md:text-2xl transition-transform ${hasBadge || isFunnelLocked ? 'text-gray-600' : isActive ? 'text-primary' : 'group-hover:text-white group-hover:scale-110'}`}
                                    style={isActive && !hasBadge && !isFunnelLocked ? { fontVariationSettings: "'FILL' 1" } : {}}
                                >
                                    {isFunnelLocked ? 'lock' : item.icon}
                                </span>
                                <span className={`text-xs md:text-[13px] font-medium tracking-wide text-left ${isActive && !hasBadge && !isFunnelLocked ? 'font-bold' : ''}`}>
                                    {item.label}
                                </span>
                                {item.id === 'viewings' && gcalConnected && (
                                    <svg className="size-3.5 shrink-0 opacity-80" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                )}
                                {isFunnelLocked && (
                                    <span className="ml-auto text-[8px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold font-mono border border-amber-500/30">
                                        {filledCount}/{totalCount}
                                    </span>
                                )}
                                {hasBadge && !isFunnelLocked && (
                                    <span className="ml-auto text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-primary/50 shadow-[0_0_10px_rgba(34,197,94,0.4)] animate-pulse">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </nav>

                {/* User Profile */}
                <div className="p-6 md:p-10 mt-auto border-t border-white/[0.03]">
                    <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className="relative shrink-0">
                                <div className="size-10 md:size-11 rounded-full bg-primary/20 border border-primary/30 p-0.5 group-hover:rotate-12 transition-all duration-500">
                                    <img
                                        src={`https://unavatar.io/${session?.user?.email}?fallback=https://api.dicebear.com/7.x/avataaars/svg?seed=${session?.user?.email}`}
                                        alt="User"
                                        className="size-full rounded-full object-cover"
                                    />
                                </div>
                                <div className="absolute -right-0.5 -bottom-0.5 size-3 bg-green-500 border-2 border-[#0a0a0c] rounded-full shadow-lg"></div>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <p className="text-white text-sm font-bold tracking-tight truncate">
                                    {session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0]}
                                </p>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest truncate">
                                    {session?.user?.email}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="size-9 md:size-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-gray-500 hover:text-red-400 hover:border-red-400/30 transition-all active:scale-95 shrink-0"
                            title="Sair"
                        >
                            <span className="material-symbols-outlined text-[18px] md:text-[20px]">logout</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}
