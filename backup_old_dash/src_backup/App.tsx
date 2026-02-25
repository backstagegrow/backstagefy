import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import LeadPipeline from './components/LeadPipeline'
import WhatsAppConfig from './components/WhatsAppConfig'

// Dummy Stats for Neon Design - Event Venue Context
const StatsGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="sphaus-glass-card">
            <div className="absolute -right-6 -top-6 size-24 bg-primary/5 blur-3xl rounded-full"></div>
            <div className="flex justify-between items-start mb-6">
                <span className="text-primary/40 font-bold text-xs uppercase tracking-widest">Total Pulse</span>
                <div className="text-green-400 text-xs font-bold px-2 py-1 bg-green-400/10 rounded-lg flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] leading-none">trending_up</span> 14%
                </div>
            </div>
            <h3 className="sphaus-stat-value">42</h3>
            <p className="sphaus-stat-label">Active Inquiries</p>
        </div>
        <div className="sphaus-glass-card">
            <div className="flex justify-between items-start mb-6">
                <span className="text-primary/40 font-bold text-xs uppercase tracking-widest">Calendar</span>
                <div className="text-primary text-xs font-bold px-2 py-1 bg-primary/10 rounded-lg flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] leading-none">star</span> New
                </div>
            </div>
            <h3 className="sphaus-stat-value">18</h3>
            <p className="sphaus-stat-label">Confirmed Events</p>
        </div>
        <div className="sphaus-glass-card">
            <div className="flex justify-between items-start mb-6">
                <span className="text-primary/40 font-bold text-xs uppercase tracking-widest">Experience</span>
                <div className="text-blue-400 text-xs font-bold px-2 py-1 bg-blue-400/10 rounded-lg flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] leading-none">visibility</span> +5
                </div>
            </div>
            <h3 className="sphaus-stat-value">8</h3>
            <p className="sphaus-stat-label">Site Visits This Week</p>
        </div>
        <div className="sphaus-glass-card border-primary/20 bg-primary/5">
            <div className="absolute -right-10 -bottom-10 size-32 bg-primary/10 blur-3xl rounded-full"></div>
            <div className="flex justify-between items-start mb-6">
                <span className="text-primary font-bold text-xs uppercase tracking-[0.2em]">Revenue Forecast</span>
                <div className="text-primary-glow text-xs font-bold px-2 py-1 bg-primary/20 rounded-lg flex items-center gap-1 border border-primary/30">
                    <span className="material-symbols-outlined text-[14px] leading-none">payments</span> Q3
                </div>
            </div>
            <h3 className="sphaus-stat-value text-primary">R$450k</h3>
            <p className="sphaus-stat-label text-gray-400">Projected Volume</p>
        </div>
    </div>
)

function App() {
    const [activeTab, setActiveTab] = useState('dashboard')

    // Efficient Mouse Tracking for Glow Effects
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            requestAnimationFrame(() => {
                const cards = document.querySelectorAll('.kanban-card');
                cards.forEach(card => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
                    (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
                });
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="flex h-screen w-full overflow-hidden sphaus-app-bg">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

            <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
                <header className="flex items-center justify-between px-10 py-8 border-b border-white/[0.05] bg-black/20 backdrop-blur-md">
                    <div className="flex flex-col">
                        <h2 className="text-white text-3xl font-heading tracking-tight">
                            {activeTab === 'whatsapp' ? 'WhatsApp Intelligence' : 'Intelligence Hub'}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            {activeTab === 'whatsapp' ? 'AI Agent Status: Active & Monitoring' : 'Venue occupancy status: '}
                            {activeTab !== 'whatsapp' && <span className="text-primary font-medium italic">High Demand</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="hidden xl:flex items-center bg-white/[0.03] border border-white/10 rounded-full px-5 py-2.5 w-80 focus-within:border-primary/50 transition-all">
                            <span className="material-symbols-outlined text-gray-500 text-[20px]">search</span>
                            <input className="bg-transparent border-none text-white placeholder-gray-600 text-sm focus:ring-0 w-full ml-3 focus:outline-none" placeholder="Search events, brands..." type="text" />
                        </div>
                        <div className="flex gap-4">
                            <button className="relative size-11 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/40 transition-all">
                                <span className="material-symbols-outlined">notifications</span>
                                <span className="absolute top-2 right-2 size-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(197,160,89,0.8)]"></span>
                            </button>
                            <button className="size-11 rounded-full bg-primary text-black flex items-center justify-center hover:scale-105 transition-all shadow-lg shadow-primary/20">
                                <span className="material-symbols-outlined font-bold">add</span>
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-10 py-8 scrollbar-hide">
                    <div className="max-w-[1920px] mx-auto space-y-2">
                        {/* Content Area */}
                        {activeTab === 'dashboard' && (
                            <>
                                <StatsGrid />
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-white text-2xl font-heading tracking-tight">Events Pipeline</h2>
                                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-gray-400 uppercase tracking-widest font-bold">Live Board</span>
                                    </div>
                                </div>
                                <div className="h-[calc(100vh-420px)]">
                                    <LeadPipeline />
                                </div>
                            </>
                        )}

                        {activeTab === 'whatsapp' && (
                            <WhatsAppConfig />
                        )}

                        {activeTab !== 'dashboard' && activeTab !== 'whatsapp' && (
                            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                                <span className="material-symbols-outlined text-primary text-6xl mb-4">construction</span>
                                <h3 className="text-white text-2xl font-heading mb-2">Module Under Construction</h3>
                                <p className="text-gray-500">We are currently building this section of the premium dashboard.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}

export default App
