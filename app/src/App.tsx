import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import LeadPipeline from './components/LeadPipeline'
import WhatsAppConfig from './components/WhatsAppConfig'
import NewLeadModal from './components/NewLeadModal'
import ScheduleView from './components/ScheduleView'
import DashboardStats from './components/DashboardStats'
import MediaGallery from './components/MediaGallery'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import AgentConfigurator from './components/AgentConfigurator'
import FunnelBuilder from './components/FunnelBuilder'
import KnowledgeBase from './components/KnowledgeBase'

import { TenantProvider, useTenant } from './context/TenantContext'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

const ComingSoon = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="size-20 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-4xl">architecture</span>
        </div>
        <h3 className="text-white text-2xl font-heading mb-2">{title}</h3>
        <p className="text-gray-500 max-w-sm mx-auto">Este módulo está em desenvolvimento para a plataforma BackStageFy.</p>
    </div>
)

const Header = ({ activeTab, onAddClick }: { activeTab: string, onAddClick: () => void }) => {
    const titles: Record<string, { title: string, subtitle: string }> = {
        'dashboard': { title: 'Painel Geral', subtitle: 'Visão geral de performance e métricas' },
        'leads': { title: 'Pipeline de Leads', subtitle: 'Gerencie e qualifique seus leads' },
        'agents': { title: 'Configurar Agentes', subtitle: 'Personalize seus agentes de IA' },
        'whatsapp': { title: 'WhatsApp & Canais', subtitle: 'Configure a integração dos canais' },
        'knowledge': { title: 'Base de Conhecimento', subtitle: 'Gerencie documentos e FAQ do agente' },
        'funnel': { title: 'Editor de Funil', subtitle: 'Configure as etapas de atendimento' },
        'viewings': { title: 'Agenda', subtitle: 'Visitas e agendamentos programados' },
        'billing': { title: 'Plano & Uso', subtitle: 'Gerencie assinatura e limites' },
    }

    const { title, subtitle } = titles[activeTab] || titles['dashboard']

    return (
        <header className="flex items-center justify-between px-10 py-10 border-b border-white/[0.03] backdrop-blur-xl bg-black/10 z-20">
            <div className="flex flex-col">
                <h2 className="text-white text-4xl font-heading font-light tracking-tight">{title}</h2>
                <p className="text-primary/50 text-xs font-bold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                    <span className="size-1.5 bg-primary rounded-full animate-pulse"></span>
                    {subtitle}
                </p>
            </div>
            <div className="flex items-center gap-6">
                <div className="hidden lg:flex items-center bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-3 w-80 group focus-within:border-primary/40 transition-all duration-500">
                    <span className="material-symbols-outlined text-gray-500 text-[20px] group-focus-within:text-primary">search</span>
                    <input
                        className="bg-transparent border-none text-white placeholder-gray-700 text-sm focus:ring-0 w-full ml-3 focus:outline-none"
                        placeholder="Pesquisar..."
                        type="text"
                    />
                </div>
                <div className="flex gap-4">
                    <button className="relative size-12 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/30 transition-all active:scale-95 group">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-3 right-3 size-2 bg-primary rounded-full"></span>
                    </button>
                    <button onClick={onAddClick} className="backstagefy-btn-primary size-12 shadow-none rounded-2xl">
                        <span className="material-symbols-outlined font-bold">add</span>
                    </button>
                </div>
            </div>
        </header>
    )
}

function DashboardContent({ session, onLogout }: { session: Session, onLogout: () => void }) {
    const { tenant, loading: tenantLoading } = useTenant()
    const [activeTab, setActiveTab] = useState('dashboard')
    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    if (tenantLoading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#050505]">
                <div className="size-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
        )
    }

    if (!tenant) {
        return (
            <Onboarding
                userId={session.user.id}
                onComplete={() => window.location.reload()}
            />
        )
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-bg-dark font-sans">
            <Sidebar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                session={session}
                onLogout={onLogout}
            />

            <main className="flex-1 flex flex-col relative overflow-hidden">
                <Header activeTab={activeTab} onAddClick={() => setIsNewLeadModalOpen(true)} />

                <div className="flex-1 overflow-y-auto px-10 py-12 scrollbar-hide">
                    <div className="max-w-[1800px] mx-auto">
                        {activeTab === 'dashboard' && <DashboardStats />}

                        {activeTab === 'leads' && (
                            <div className="space-y-6 animate-in fade-in duration-700">
                                <div className="h-[calc(100vh-320px)]">
                                    <LeadPipeline key={refreshTrigger} />
                                </div>
                            </div>
                        )}

                        {activeTab === 'agents' && <AgentConfigurator />}

                        {activeTab === 'whatsapp' && (
                            <div className="animate-in fade-in zoom-in-95 duration-500">
                                <WhatsAppConfig />
                            </div>
                        )}

                        {activeTab === 'viewings' && <ScheduleView />}

                        {activeTab === 'funnel' && <FunnelBuilder />}

                        {activeTab === 'knowledge' && <KnowledgeBase />}

                        {activeTab === 'portfolio' && <MediaGallery />}

                        {!['dashboard', 'leads', 'agents', 'whatsapp', 'viewings', 'funnel', 'knowledge', 'portfolio'].includes(activeTab) && (
                            <ComingSoon title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} />
                        )}
                    </div>
                </div>

                <div className="fixed -bottom-64 -right-64 size-[600px] bg-primary/5 blur-[160px] rounded-full pointer-events-none z-0"></div>
            </main>

            <NewLeadModal
                isOpen={isNewLeadModalOpen}
                onClose={() => setIsNewLeadModalOpen(false)}
                onSuccess={() => setRefreshTrigger(prev => prev + 1)}
            />
        </div>
    )
}

function App() {
    const [session, setSession] = useState<Session | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const handleLogout = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    useEffect(() => {
        if (!supabase) {
            setIsLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setIsLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (isLoading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#050505]">
                <div className="size-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
        )
    }

    if (!session) {
        return <Login onLoginSuccess={() => window.location.reload()} />;
    }

    return (
        <TenantProvider>
            <DashboardContent session={session} onLogout={handleLogout} />
        </TenantProvider>
    )
}

export default App
