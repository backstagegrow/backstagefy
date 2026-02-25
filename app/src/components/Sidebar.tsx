import { Session } from '@supabase/supabase-js'

interface SidebarProps {
    activeTab: string
    onTabChange: (tab: string) => void
    session: Session | null
    onLogout: () => void
}

export default function Sidebar({ activeTab, onTabChange, session, onLogout }: SidebarProps) {
    const menuItems = [
        { id: 'dashboard', icon: 'dashboard', label: 'Painel Geral' },
        { id: 'leads', icon: 'groups', label: 'Pipeline de Leads' },
        { id: 'agents', icon: 'smart_toy', label: 'Meus Agentes' },
        { id: 'whatsapp', icon: 'chat', label: 'WhatsApp & Canais' },
        { id: 'knowledge', icon: 'menu_book', label: 'Base de Conhecimento' },
        { id: 'funnel', icon: 'filter_alt', label: 'Editor de Funil' },
        { id: 'broadcast', icon: 'campaign', label: 'Campanhas', badge: 'Em Breve' },
        { id: 'viewings', icon: 'calendar_month', label: 'Agenda' },
        { id: 'billing', icon: 'credit_card', label: 'Plano & Uso' },
    ] as const

    return (
        <aside className="w-80 flex-shrink-0 flex flex-col bg-black/40 backdrop-blur-2xl border-r border-white/[0.03] relative z-30 h-screen overflow-hidden">
            {/* Logo Section */}
            <div className="p-10 pb-16">
                <div className="flex flex-col">
                    <h1 className="text-white text-3xl font-heading font-light tracking-tighter uppercase">BackStageFy</h1>
                    <p className="text-primary/40 text-[9px] font-bold tracking-[0.3em] uppercase mt-1">SaaS Platform</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-6 space-y-2 overflow-y-auto scrollbar-hide">
                {menuItems.map((item) => {
                    const isActive = activeTab === item.id
                    const hasBadge = 'badge' in item && item.badge
                    return (
                        <button
                            key={item.id}
                            onClick={() => !hasBadge && onTabChange(item.id)}
                            className={`w-full group flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 relative ${hasBadge
                                ? 'text-gray-600 cursor-default border border-transparent'
                                : isActive
                                    ? 'bg-primary/5 text-primary border border-primary/20'
                                    : 'text-gray-500 hover:text-white hover:bg-white/[0.02] border border-transparent'
                                }`}
                        >
                            {isActive && !hasBadge && <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full shadow-primary"></div>}
                            <span
                                className={`material-symbols-outlined text-2xl transition-transform ${hasBadge ? 'text-gray-600' : isActive ? 'text-primary' : 'group-hover:text-white group-hover:scale-110'}`}
                                style={isActive && !hasBadge ? { fontVariationSettings: "'FILL' 1" } : {}}
                            >
                                {item.icon}
                            </span>
                            <span className={`text-[13px] font-medium tracking-wide ${isActive && !hasBadge ? 'font-bold' : ''}`}>
                                {item.label}
                            </span>
                            {hasBadge && (
                                <span className="ml-auto text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-primary/50 shadow-[0_0_10px_rgba(34,197,94,0.4)] animate-pulse">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    )
                })}
            </nav>

            {/* User Profile */}
            <div className="p-10 mt-auto border-t border-white/[0.03]">
                <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="size-11 rounded-full bg-primary/20 border border-primary/30 p-0.5 group-hover:rotate-12 transition-all duration-500">
                                <img
                                    src={`https://unavatar.io/${session?.user?.email}?fallback=https://api.dicebear.com/7.x/avataaars/svg?seed=${session?.user?.email}`}
                                    alt="User"
                                    className="size-full rounded-full object-cover"
                                />
                            </div>
                            <div className="absolute -right-0.5 -bottom-0.5 size-3 bg-green-500 border-2 border-[#0a0a0c] rounded-full shadow-lg"></div>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-white text-sm font-bold tracking-tight truncate max-w-[120px]">
                                {session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0]}
                            </p>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest truncate max-w-[120px]">
                                {session?.user?.email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="size-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-gray-500 hover:text-red-400 hover:border-red-400/30 transition-all active:scale-95"
                        title="Sair"
                    >
                        <span className="material-symbols-outlined text-[20px]">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    )
}
