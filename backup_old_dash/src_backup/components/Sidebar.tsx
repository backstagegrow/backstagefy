// import { LayoutDashboard, Users, FolderOpen, PieChart, Settings, HelpCircle, LogOut } from 'lucide-react'

interface SidebarProps {
    activeTab: string
    onTabChange: (tab: string) => void
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps): JSX.Element {
    const menuItems = [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'leads', icon: 'groups', label: 'Event Inquiries' },
        { id: 'portfolio', icon: 'theater_comedy', label: 'Event Concepts' },
        { id: 'analytics', icon: 'monitoring', label: 'Venue Analytics' },
        { id: 'viewings', icon: 'calendar_month', label: 'Venue Tours' },
        { id: 'whatsapp', icon: 'smart_toy', label: 'WhatsApp AI' },
    ]

    return (
        <aside className="w-72 flex-shrink-0 flex flex-col sidebar-glass relative z-30 h-screen">
            <div className="p-8">
                <div className="flex items-center gap-4 mb-10">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-primary/30 rounded-full blur opacity-50 group-hover:opacity-100 transition duration-1000"></div>
                        <div className="relative bg-black aspect-square rounded-full size-12 flex items-center justify-center border border-primary/50">
                            <span className="material-symbols-outlined text-primary text-2xl font-light">apartment</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-white text-2xl font-heading tracking-tighter">spHAUS</h1>
                        <p className="primary-glow text-[10px] font-bold tracking-[0.2em] uppercase text-primary/60">Private Concierge</p>
                    </div>
                </div>

                <nav className="flex flex-col gap-3">
                    {menuItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <div
                                key={item.id}
                                onClick={() => onTabChange(item.id)}
                                className={`group flex items-center gap-3 px-5 py-3.5 rounded-xl cursor-pointer transition-all border ${isActive
                                    ? 'bg-primary/10 border-primary/30'
                                    : 'hover:bg-white/5 border-transparent hover:border-white/10'
                                    }`}
                            >
                                <span
                                    className={`material-symbols-outlined text-[22px] ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-white'}`}
                                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                                >
                                    {item.icon}
                                </span>
                                <p className={`text-sm font-medium ${isActive ? 'text-primary font-semibold tracking-wide' : 'text-gray-400 group-hover:text-white'}`}>
                                    {item.label}
                                </p>
                            </div>
                        )
                    })}
                </nav>
            </div>

            <div className="mt-auto p-8">
                <div className="neon-glass-panel rounded-2xl p-4 mb-6 border-primary/10">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div
                                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-11 ring-1 ring-primary/40 shadow-lg shadow-primary/10"
                                style={{ backgroundImage: 'url("https://api.dicebear.com/7.x/avataaars/svg?seed=Alexander")' }}
                            ></div>
                            <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-[#0a0a0c] rounded-full"></div>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-white text-sm font-bold tracking-tight">Alexander V.</p>
                            <p className="text-primary/60 text-[10px] font-bold uppercase tracking-widest">Executive Broker</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between px-2 text-gray-500">
                    <button className="hover:text-primary transition-colors"><span className="material-symbols-outlined">settings</span></button>
                    <button className="hover:text-primary transition-colors"><span className="material-symbols-outlined">logout</span></button>
                </div>
            </div>
        </aside>
    )
}
