import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import LeadPipeline from './components/LeadPipeline'
import WhatsAppConfig from './components/WhatsAppConfig'
import NewLeadModal from './components/NewLeadModal'
import NewAppointmentModal from './components/NewAppointmentModal'
import ScheduleView from './components/ScheduleView'
import DashboardStats from './components/DashboardStats'
import Login from './components/Login'
import LandingPage from './components/LandingPage'
import Onboarding from './components/Onboarding'
import AgentConfigurator from './components/AgentConfigurator'
import FunnelBuilder from './components/FunnelBuilder'
import KnowledgeBase from './components/KnowledgeBase'
import TicketDashboard from './components/TicketDashboard'
import FinanceDashboard from './components/FinanceDashboard'
import { useKnowledgeUnlock } from './lib/useKnowledgeUnlock'

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

const Header = ({ activeTab, onAddClick, onMenuClick }: { activeTab: string, onAddClick: () => void, onMenuClick: () => void }) => {
    const titles: Record<string, { title: string, subtitle: string }> = {
        'dashboard': { title: 'Painel Geral', subtitle: 'Visão geral de performance e métricas' },
        'leads': { title: 'Pipeline de Leads', subtitle: 'Gerencie e qualifique seus leads' },
        'agents': { title: 'Configurar Agentes', subtitle: 'Personalize seus agentes de IA' },
        'whatsapp': { title: 'WhatsApp & Canais', subtitle: 'Configure a integração dos canais' },
        'knowledge': { title: 'Base de Conhecimento', subtitle: 'Gerencie documentos e FAQ do agente' },
        'funnel': { title: 'Editor de Funil', subtitle: 'Configure as etapas de atendimento' },
        'sales': { title: 'Vendas & Plataformas', subtitle: 'Central de vendas e integrações' },
        'viewings': { title: 'Agenda', subtitle: 'Visitas e agendamentos programados' },
        'finance': { title: 'Financeiro', subtitle: 'Gestão financeira e fluxo de caixa' },
        'billing': { title: 'Plano & Uso', subtitle: 'Gerencie assinatura e limites de uso' },
    }

    const { title, subtitle } = titles[activeTab] || titles['dashboard']

    return (
        <header className="flex items-center justify-between px-4 py-4 md:px-8 md:py-6 lg:px-10 lg:py-10 border-b border-white/[0.03] backdrop-blur-xl bg-black/10 z-20">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
                {/* Hamburger - mobile only */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden size-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-gray-400 hover:text-primary transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined">menu</span>
                </button>
                <div className="flex flex-col min-w-0">
                    <h2 className="text-white text-xl md:text-2xl lg:text-4xl font-heading font-light tracking-tight truncate">{title}</h2>
                    <p className="text-primary/50 text-[9px] md:text-xs font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1 flex items-center gap-2">
                        <span className="size-1.5 bg-primary rounded-full animate-pulse"></span>
                        <span className="truncate">{subtitle}</span>
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3 md:gap-6 shrink-0">
                <div className="hidden xl:flex items-center bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-3 w-80 group focus-within:border-primary/40 transition-all duration-500">
                    <span className="material-symbols-outlined text-gray-500 text-[20px] group-focus-within:text-primary">search</span>
                    <input
                        className="bg-transparent border-none text-white placeholder-gray-700 text-sm focus:ring-0 w-full ml-3 focus:outline-none"
                        placeholder="Pesquisar..."
                        type="text"
                    />
                </div>
                <div className="flex gap-2 md:gap-4">
                    <button className="relative size-10 md:size-12 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/30 transition-all active:scale-95 group">
                        <span className="material-symbols-outlined text-[20px] md:text-[24px]">notifications</span>
                        <span className="absolute top-2 right-2 md:top-3 md:right-3 size-2 bg-primary rounded-full"></span>
                    </button>
                    <button onClick={onAddClick} className="backstagefy-btn-primary size-10 md:size-12 shadow-none rounded-xl md:rounded-2xl !px-0">
                        <span className="material-symbols-outlined font-bold text-[20px] md:text-[24px]">add</span>
                    </button>
                </div>
            </div>
        </header>
    )
}

const FunnelGuard = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
    const kbUnlock = useKnowledgeUnlock()

    if (kbUnlock.loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    if (!kbUnlock.unlocked) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-in fade-in duration-700">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-[50px] pointer-events-none" />
                    <div className="size-28 rounded-[2rem] bg-white/[0.02] border border-white/5 flex items-center justify-center relative z-10 shadow-2xl">
                        <span className="material-symbols-outlined text-5xl text-amber-400/60">lock</span>
                    </div>
                </div>
                <h3 className="text-2xl text-white font-heading font-light mb-3">Editor de Funil Bloqueado</h3>
                <p className="text-white/40 text-sm max-w-md mb-8 leading-relaxed">
                    Preencha a Base de Conhecimento para que a IA conheça sua empresa e possa criar funis de atendimento personalizados.
                </p>

                <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-lg">
                    {kbUnlock.categories.map(cat => (
                        <div
                            key={cat.id}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                                cat.filled
                                    ? 'bg-primary/10 border-primary/20 text-primary'
                                    : 'bg-white/[0.02] border-amber-500/20 text-amber-400 animate-pulse'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">
                                {cat.filled ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            {cat.label}
                        </div>
                    ))}
                </div>

                <p className="text-white/25 text-xs mb-6">
                    {kbUnlock.filledCount} de {kbUnlock.totalCount} categorias preenchidas
                </p>

                <button
                    onClick={() => onNavigate('knowledge')}
                    className="backstagefy-btn-primary flex items-center gap-2 px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest"
                >
                    <span className="material-symbols-outlined text-sm">menu_book</span>
                    Ir para Base de Conhecimento
                </button>
            </div>
        )
    }

    return <FunnelBuilder />
}

function DashboardContent({ session, onLogout }: { session: Session, onLogout: () => void }) {
    const { tenant, loading: tenantLoading } = useTenant()
    const [activeTab, setActiveTab] = useState('dashboard')
    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false)
    const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <main className="flex-1 flex flex-col relative overflow-hidden w-full">
                <Header
                    activeTab={activeTab}
                    onAddClick={() => {
                        if (activeTab === 'viewings') {
                            setIsNewAppointmentModalOpen(true)
                        } else {
                            setIsNewLeadModalOpen(true)
                        }
                    }}
                    onMenuClick={() => setIsSidebarOpen(true)}
                />

                <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6 md:py-8 lg:px-10 lg:py-12 scrollbar-hide">
                    <div className="max-w-[1800px] mx-auto">
                        {activeTab === 'dashboard' && <DashboardStats />}

                        {activeTab === 'leads' && (
                            <div className="space-y-6 animate-in fade-in duration-700">
                                <div className="h-[calc(100vh-220px)] md:h-[calc(100vh-320px)]">
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

                        {activeTab === 'funnel' && <FunnelGuard onNavigate={setActiveTab} />}

                        {activeTab === 'knowledge' && <KnowledgeBase onNavigate={setActiveTab} />}

                        {activeTab === 'sales' && <TicketDashboard />}

                        {activeTab === 'finance' && <FinanceDashboard />}

                        {!['dashboard', 'leads', 'agents', 'whatsapp', 'viewings', 'funnel', 'knowledge', 'sales', 'finance', 'billing'].includes(activeTab) && (
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
            <NewAppointmentModal
                isOpen={isNewAppointmentModalOpen}
                onClose={() => setIsNewAppointmentModalOpen(false)}
                onSuccess={() => setRefreshTrigger(prev => prev + 1)}
            />
        </div>
    )
}

function App() {
    const [session, setSession] = useState<Session | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)

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
        if (showLogin) {
            return <Login onLoginSuccess={() => window.location.reload()} />;
        }
        return <LandingPage onNavigateToLogin={() => setShowLogin(true)} />;
    }

    return (
        <TenantProvider>
            <DashboardContent session={session} onLogout={handleLogout} />
        </TenantProvider>
    )
}

export default App
