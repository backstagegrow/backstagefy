import { useState, useEffect, useRef, useCallback } from 'react'
import MatrixRain from './MatrixRain'
import MatrixExplosion from './MatrixExplosion'
import { TestimonialsColumn } from './TestimonialsColumns'
import { PixelCanvas } from './ui/PixelCanvas'
import { CardStack, CardStackItem } from './ui/CardStack'

interface LandingPageProps {
    onNavigateToLogin: () => void
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigateToLogin }) => {
    const [scrollY, setScrollY] = useState(0)
    const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set())
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
    
    // Canvas-based smooth video scrubbing refs
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const targetTimeRef = useRef(0)
    const currentTimeRef = useRef(0)
    const rafIdRef = useRef<number>(0)

    // Lerp function for silky-smooth interpolation
    const lerp = useCallback((current: number, target: number, factor: number) => {
        return current + (target - current) * factor
    }, [])

    // Continuous RAF loop — renders video frames to canvas with lerp smoothing
    useEffect(() => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return

        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return

        let lastDrawnTime = -1

        const renderLoop = () => {
            // Smoothly interpolate toward target time (0.12 = responsive yet smooth)
            currentTimeRef.current = lerp(currentTimeRef.current, targetTimeRef.current, 0.12)

            // Only seek video if time changed meaningfully (avoid unnecessary seeks)
            const timeDiff = Math.abs(currentTimeRef.current - lastDrawnTime)
            if (video.duration && timeDiff > 0.005) {
                video.currentTime = currentTimeRef.current
                lastDrawnTime = currentTimeRef.current
            }

            rafIdRef.current = requestAnimationFrame(renderLoop)
        }

        // Draw video frames to canvas on every seek
        const drawFrame = () => {
            if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                canvas.width = canvas.clientWidth
                canvas.height = canvas.clientHeight
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }

        video.addEventListener('seeked', drawFrame)
        
        // Start the render loop once video metadata is ready
        const startLoop = () => {
            // Draw first frame
            drawFrame()
            rafIdRef.current = requestAnimationFrame(renderLoop)
        }

        if (video.readyState >= 2) {
            startLoop()
        } else {
            video.addEventListener('loadeddata', startLoop, { once: true })
        }

        return () => {
            cancelAnimationFrame(rafIdRef.current)
            video.removeEventListener('seeked', drawFrame)
        }
    }, [lerp])

    // Scroll handler — only calculates target time, no direct video manipulation
    useEffect(() => {
        let ticking = false
        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const currentScrollY = window.scrollY
                    setScrollY(currentScrollY)

                    // Calculate target video time based on scroll position
                    const hero = sectionRefs.current['hero']
                    const video = videoRef.current
                    if (hero && video && video.duration) {
                        const heroRect = hero.getBoundingClientRect()
                        const scrollDistance = heroRect.height - window.innerHeight
                        if (scrollDistance > 0) {
                            let progress = (-heroRect.top) / scrollDistance
                            progress = Math.max(0, Math.min(1, progress))
                            // Set TARGET time — the lerp loop will smoothly chase it
                            targetTimeRef.current = progress * video.duration
                        }
                    }
                    
                    ticking = false
                })
                ticking = true
            }
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()
        
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setVisibleSections((prev) => new Set(prev).add(entry.target.id))
                    }
                })
            },
            { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
        )

        Object.values(sectionRefs.current).forEach((ref) => {
            if (ref) observer.observe(ref)
        })

        return () => observer.disconnect()
    }, [])

    const setRef = (id: string) => (el: HTMLElement | null) => {
        sectionRefs.current[id] = el
    }

    const isVisible = (id: string) => visibleSections.has(id)

    const scrollToSection = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }

    return (
        <div className="landing-page bg-[#050505] text-white" style={{ overflowX: 'clip' }}>
            {/* ═══════════════════ NAVBAR ═══════════════════ */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrollY > 80 ? 'bg-black/80 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'}`}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <span className="text-primary font-black text-sm">B</span>
                        </div>
                        <span className="font-heading text-white text-lg tracking-tight">BACKSTAGEFY</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <button onClick={() => scrollToSection('problema')} className="text-white/50 hover:text-primary text-xs uppercase tracking-[0.2em] transition-colors">Problema</button>
                        <button onClick={() => scrollToSection('solucao')} className="text-white/50 hover:text-primary text-xs uppercase tracking-[0.2em] transition-colors">Solução</button>
                        <button onClick={() => scrollToSection('features')} className="text-white/50 hover:text-primary text-xs uppercase tracking-[0.2em] transition-colors">Features</button>
                        <button onClick={() => scrollToSection('como-funciona')} className="text-white/50 hover:text-primary text-xs uppercase tracking-[0.2em] transition-colors">Como Funciona</button>
                    </div>
                    <button
                        onClick={onNavigateToLogin}
                        className="backstagefy-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest"
                    >
                        Entrar
                    </button>
                </div>
            </nav>            {/* ═══════════════════ SECTION 1: HERO (SCROLL-BOUND VIDEO) ═══════════════════ */}
            <section ref={(el) => (sectionRefs.current['hero'] = el)} className="relative h-[200vh] bg-[#050505]">
                {/* Sticky Container keeps the Hero pinned to the screen while scrolling through the 200vh area */}
                <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center">
                    
                    {/* Hidden Video — used only as frame source for canvas */}
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                        preload="auto"
                        className="hidden"
                    >
                        <source src="/hero-video.mp4" type="video/mp4" />
                    </video>

                    {/* Canvas — renders video frames smoothly */}
                    <div className="absolute inset-0 w-full h-full">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full opacity-70"
                            style={{ filter: 'brightness(0.5) saturate(1.2)' }}
                        />
                    </div>

                    {/* Dark gradient overlays — stay static */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-[#050505] z-[1]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/40 z-[1]" />

                    {/* Hero Content — fades gently as user scrolls */}
                    <div
                        className="relative z-10 text-left px-6 md:px-16 lg:px-24 max-w-4xl"
                        style={{
                            opacity: Math.max(0, 1 - scrollY / 1200),
                            willChange: 'opacity',
                        }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 mb-8 animate-fade-in-up">
                            <span className="size-2 bg-primary rounded-full animate-pulse" />
                            <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">Plataforma Inteligente</span>
                        </div>

                        <h1
                            className="text-3xl sm:text-4xl md:text-[2.75rem] lg:text-5xl font-heading font-light leading-[1.15] mb-6 animate-fade-in-up"
                            style={{ animationDelay: '200ms' }}
                        >
                            O Bastidor da Sua Operação.<br />
                            <span className="text-primary font-normal">Automatizado por IA.</span>
                        </h1>

                        <p
                            className="text-white/50 text-base sm:text-lg md:text-xl max-w-2xl mb-10 font-light leading-relaxed animate-fade-in-up"
                            style={{ animationDelay: '400ms' }}
                        >
                            Gerencie leads, agendamentos e funis de vendas com uma concierge inteligente que trabalha 24/7 no WhatsApp.
                        </p>

                        <div className="flex flex-col sm:flex-row items-start gap-4 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
                            <button
                                onClick={onNavigateToLogin}
                                className="backstagefy-btn-primary px-10 py-4 rounded-2xl text-sm font-bold uppercase tracking-[0.2em] group"
                            >
                                <span>Começar Agora</span>
                                <span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </button>
                            <button
                                onClick={() => scrollToSection('como-funciona')}
                                className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all text-sm uppercase tracking-widest"
                            >
                                <span className="material-symbols-outlined text-lg">play_circle</span>
                                Como Funciona
                            </button>
                        </div>
                    </div>

                    {/* Scroll indicator */}
                    <div 
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
                        style={{ opacity: Math.max(0, 1 - scrollY / 400) }}
                    >
                        <span className="text-white/20 text-[9px] uppercase tracking-[0.3em] animate-pulse">Scroll para Video</span>
                        <span className="material-symbols-outlined text-white/20 text-sm animate-bounce">expand_more</span>
                    </div>
                </div>
            </section>

            {/* ═══════════════════ SECTION 2: PROBLEMA ═══════════════════ */}
            <section
                id="problema"
                ref={setRef('problema')}
                className="relative z-10 pt-32 md:pt-40 pb-24 md:pb-32 px-6 overflow-hidden"
                style={{ 
                    marginTop: '-8rem',
                    background: 'linear-gradient(to bottom, transparent 0%, #050505 6rem, #0a0a0a 30%, #0a0a0a 100%)'
                }}
            >
                {/* Matrix Rain Background */}
                <MatrixRain opacity={0.06} fontSize={14} speed={40} />
                <div className="max-w-6xl mx-auto">
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('problema') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">O Problema</span>
                        <h2 className="text-3xl md:text-5xl font-heading font-light mt-4 mb-6">
                            Sua equipe ainda faz<br />
                            <span className="text-primary">tudo manualmente?</span>
                        </h2>
                        <p className="text-white/40 text-lg max-w-xl mx-auto">
                            Enquanto você perde tempo em tarefas repetitivas, seus concorrentes já automatizaram.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {[
                            {
                                icon: 'chat_error',
                                title: 'Leads perdidos no WhatsApp',
                                desc: 'Mensagens sem resposta, oportunidades desperdiçadas. Cada minuto sem atender é um cliente que vai pro concorrente.',
                                delay: 0
                            },
                            {
                                icon: 'event_busy',
                                title: 'Agendamentos bagunçados',
                                desc: 'Conflito de horários, no-shows sem controle. Ligações e mais ligações pra remarcar.',
                                delay: 200
                            },
                            {
                                icon: 'visibility_off',
                                title: 'Zero visibilidade do funil',
                                desc: 'Não sabe onde cada lead está na jornada. Decisões no escuro, sem dados pra otimizar.',
                                delay: 400
                            }
                        ].map((card, i) => (
                            <div
                                key={i}
                                className={`group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 hover:border-primary/20 transition-all duration-700 hover:-translate-y-2 ${isVisible('problema') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                                style={{ transitionDelay: `${card.delay + 300}ms` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative z-10">
                                    <div className="size-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                                        <span className="material-symbols-outlined text-red-400 text-2xl">{card.icon}</span>
                                    </div>
                                    <h3 className="text-white text-xl font-heading mb-3">{card.title}</h3>
                                    <p className="text-white/40 text-sm leading-relaxed">{card.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Transition: Problema → Solução */}
            <div className="relative z-10 h-24" style={{ background: 'linear-gradient(to bottom, #0a0a0a, #0a0a0a)' }} />

            {/* ═══════════════════ SECTION 3: SOLUÇÃO ═══════════════════ */}
            <section
                id="solucao"
                ref={setRef('solucao')}
                className="relative z-10 bg-[#0a0a0a] py-24 md:py-32 px-6 overflow-hidden"
            >
                {/* Dashboard as background with low opacity */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <img
                        src="/dashboard-preview.png"
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover object-top opacity-[0.04]"
                        aria-hidden="true"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-transparent to-[#0a0a0a]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]" />
                </div>

                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />

                {/* Matrix Explosion Effect */}
                <MatrixExplosion trigger={isVisible('solucao')} />

                <div className="max-w-6xl mx-auto relative z-10">
                    {/* Header */}
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('solucao') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">A Solução</span>
                        <h2 className="text-3xl md:text-5xl font-heading font-light mt-4 mb-6">
                            Um ecossistema que<br />
                            <span className="text-primary font-normal">conecta tudo</span>
                        </h2>
                        <p className="text-white/40 text-lg max-w-2xl mx-auto">
                            O Backstagefy integra com as ferramentas que você já usa. Gateways de pagamento, WhatsApp, agendas e CRMs — tudo sincronizado em uma plataforma inteligente.
                        </p>
                    </div>

                    {/* Integration CardStack 3D Carousel */}
                    <div className={`mb-16 transition-all duration-1000 delay-200 ${isVisible('solucao') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <CardStack
                            items={[
                                {
                                    id: 'whatsapp',
                                    title: 'WhatsApp',
                                    description: 'Atendimento IA 24/7 com chatbot inteligente que qualifica e converte leads automaticamente.',
                                    color: '#25D366',
                                    icon: (
                                        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="#25D366">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                        </svg>
                                    ),
                                },
                                {
                                    id: 'hotmart',
                                    title: 'Hotmart',
                                    description: 'Integração completa com a maior plataforma de infoprodutos do Brasil. Cursos, mentorias e assinaturas.',
                                    color: '#F04E23',
                                    icon: <span className="text-2xl font-black" style={{ color: '#F04E23' }}>H</span>,
                                },
                                {
                                    id: 'kiwify',
                                    title: 'Kiwify',
                                    description: 'Vendas digitais com checkout otimizado. Gerencie seus produtos e assinaturas em um só lugar.',
                                    color: '#00C853',
                                    icon: <span className="text-2xl font-black" style={{ color: '#00C853' }}>K</span>,
                                },
                                {
                                    id: 'sympla',
                                    title: 'Sympla',
                                    description: 'Gestão de eventos e venda de ingressos integrada. Controle total da sua bilheteria digital.',
                                    color: '#FF6B35',
                                    icon: <span className="text-2xl font-black" style={{ color: '#FF6B35' }}>S</span>,
                                },
                                {
                                    id: 'blinket',
                                    title: 'Blinket',
                                    description: 'Ingressos digitais com QR Code, check-in automático e relatórios em tempo real.',
                                    color: '#3B82F6',
                                    icon: <span className="text-2xl font-black" style={{ color: '#3B82F6' }}>B</span>,
                                },
                                {
                                    id: 'eventin',
                                    title: 'Eventin',
                                    description: 'Plataforma completa de gestão de eventos. Inscrições, pagamentos e comunicação automatizada.',
                                    color: '#8B5CF6',
                                    icon: <span className="text-2xl font-black" style={{ color: '#8B5CF6' }}>E</span>,
                                },
                                {
                                    id: 'gcalendar',
                                    title: 'Google Calendar',
                                    description: 'Agenda integrada com sincronização automática de eventos, reuniões e lembretes.',
                                    color: '#4285F4',
                                    icon: (
                                        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="#4285F4">
                                            <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 000 1.895v16.421h5.684V5.684h12.632zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0022.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" />
                                        </svg>
                                    ),
                                },
                                {
                                    id: 'gads',
                                    title: 'Google Ads',
                                    description: 'Geração automática de leads qualificados. Campanhas otimizadas por IA.',
                                    color: '#FBBC04',
                                    icon: <span className="text-2xl font-black" style={{ color: '#FBBC04' }}>GA</span>,
                                    comingSoon: true,
                                },
                                {
                                    id: 'meta',
                                    title: 'Meta Ads',
                                    description: 'Tráfego pago integrado com Facebook e Instagram. Relatórios e otimização automática.',
                                    color: '#0081FB',
                                    icon: <span className="text-2xl font-black" style={{ color: '#0081FB' }}>M</span>,
                                    comingSoon: true,
                                },
                            ] as (CardStackItem & { icon: React.ReactNode })[]}
                            cardWidth={460}
                            cardHeight={280}
                            autoAdvance
                            intervalMs={3000}
                            pauseOnHover
                            showDots
                            overlap={0.52}
                            spreadDeg={42}
                            depthPx={120}
                            tiltXDeg={10}
                            activeScale={1.05}
                            inactiveScale={0.9}
                        />
                    </div>

                    {/* Bottom stats row */}
                    <div className={`grid grid-cols-3 gap-6 max-w-3xl mx-auto transition-all duration-1000 delay-500 ${isVisible('solucao') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        {[
                            { value: '8+', label: 'Integrações Nativas' },
                            { value: '< 5min', label: 'Para Configurar' },
                            { value: '100%', label: 'Automático' },
                        ].map((stat, i) => (
                            <div key={i} className="text-center">
                                <div className="text-2xl md:text-3xl font-heading text-primary mb-1">{stat.value}</div>
                                <div className="text-white/30 text-[10px] uppercase tracking-widest">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Transition: Solução → Features */}
            <div className="relative z-10 h-24" style={{ background: 'linear-gradient(to bottom, #0a0a0a, #050505)' }} />

            {/* ═══════════════════ SECTION 4: FEATURES ═══════════════════ */}
            <section
                id="features"
                ref={setRef('features')}
                className="relative z-10 bg-[#050505] py-24 md:py-32 px-6"
            >
                <div className="max-w-6xl mx-auto">
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">Funcionalidades</span>
                        <h2 className="text-3xl md:text-5xl font-heading font-light mt-4 mb-6">
                            Tudo que você precisa.<br />
                            <span className="text-primary">Nada que não precisa.</span>
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { icon: 'smart_toy', title: 'AI Concierge WhatsApp', desc: 'IA que conversa, qualifica e agenda automaticamente pelo WhatsApp, 24 horas por dia.', delay: 0 },
                            { icon: 'monitoring', title: 'Pipeline de Leads', desc: 'Visualize cada lead no funil em tempo real. Saiba exatamente onde cada oportunidade está.', delay: 100 },
                            { icon: 'calendar_month', title: 'Agendamentos Inteligentes', desc: 'Conflitos detectados automaticamente. Reagendamento com um clique, sem ligações.', delay: 200 },
                            { icon: 'conversion_path', title: 'Funil Personalizável', desc: 'Builder visual de funis com scripts por etapa. A IA segue seu playbook.', delay: 300 },
                            { icon: 'apartment', title: 'Multi-Tenant', desc: 'Cada cliente com seu espaço, sua IA e suas configurações. Escale sem limites.', delay: 400 },
                            { icon: 'insights', title: 'Dashboard Analytics', desc: 'Métricas de conversão, volume e performance em tempo real. Dados para decisões.', delay: 500 },
                        ].map((feature, i) => (
                            <div
                                key={i}
                                className={`group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 hover:border-primary/20 transition-all duration-700 hover:-translate-y-2 ${isVisible('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                                style={{ transitionDelay: `${feature.delay + 200}ms` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative z-10">
                                    <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                                        <span className="material-symbols-outlined text-primary text-2xl">{feature.icon}</span>
                                    </div>
                                    <h3 className="text-white text-lg font-heading mb-3">{feature.title}</h3>
                                    <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Transition: Features → Como Funciona */}
            <div className="relative z-10 h-24" style={{ background: 'linear-gradient(to bottom, #050505, #050505)' }} />

            {/* ═══════════════════ SECTION 5: COMO FUNCIONA ═══════════════════ */}
            <section
                id="como-funciona"
                ref={setRef('como-funciona')}
                className="relative z-10 bg-[#050505] py-24 md:py-32 px-6"
            >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />

                <div className="max-w-4xl mx-auto relative z-10">
                    <div className={`text-center mb-20 transition-all duration-1000 ${isVisible('como-funciona') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">Passo a Passo</span>
                        <h2 className="text-3xl md:text-5xl font-heading font-light mt-4">
                            3 Passos para<br />
                            <span className="text-primary">Automatizar</span>
                        </h2>
                    </div>

                    <div className="space-y-16 relative">
                        {/* Vertical line */}
                        <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent hidden sm:block" />

                        {[
                            { step: '01', title: 'Cadastre-se e Configure', desc: 'Crie sua conta, personalize sua IA concierge com o tom de voz e regras do seu negócio.', icon: 'tune' },
                            { step: '02', title: 'Conecte seu WhatsApp', desc: 'Integre seu número de WhatsApp. Os leads entram automaticamente no seu pipeline.', icon: 'link' },
                            { step: '03', title: 'Acompanhe Tudo', desc: 'Dashboard em tempo real com todas as métricas. A IA trabalha, você acompanha.', icon: 'monitoring' },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className={`flex items-start gap-8 md:gap-16 transition-all duration-1000 ${isVisible('como-funciona') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                                style={{ transitionDelay: `${i * 300 + 200}ms` }}
                            >
                                <div className={`flex-1 ${i % 2 === 1 ? 'md:text-right md:order-1' : ''}`}>
                                    <div className={`inline-flex items-center gap-3 mb-4 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                                        <span className="text-primary/30 text-4xl font-heading font-light">{item.step}</span>
                                        <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary">{item.icon}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-white text-xl font-heading mb-2">{item.title}</h3>
                                    <p className="text-white/40 text-sm leading-relaxed max-w-sm">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════════════ SECTION 6: SOCIAL PROOF ═══════════════════ */}
            <section
                id="social-proof"
                ref={setRef('social-proof')}
                className="relative z-10 bg-[#050505] py-24 md:py-32 px-6 -mt-px"
            >
                <div className="max-w-6xl mx-auto">
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('social-proof') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        <span className="text-primary text-[10px] uppercase tracking-[0.3em] font-bold">Resultados</span>
                        <h2 className="text-3xl md:text-5xl font-heading font-light mt-4">
                            Resultados <span className="text-primary">Reais</span>
                        </h2>
                    </div>

                    {/* Stats */}
                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 transition-all duration-1000 delay-300 ${isVisible('social-proof') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                        {[
                            { value: '24/7', label: 'Atendimento' },
                            { value: '3x', label: 'Mais Conversões' },
                            { value: '< 5s', label: 'Tempo de Resposta' },
                            { value: '100%', label: 'Automatizado' },
                        ].map((stat, i) => (
                            <div key={i} className="text-center bg-white/[0.02] border border-white/5 rounded-3xl py-8 px-4 hover:border-primary/20 transition-all">
                                <div className="text-3xl md:text-4xl font-heading text-primary mb-2">{stat.value}</div>
                                <div className="text-white/40 text-xs uppercase tracking-widest">{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Testimonials — Animated Columns */}
                    <div className={`flex justify-center gap-5 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] max-h-[600px] overflow-hidden transition-all duration-1000 delay-500 ${isVisible('social-proof') ? 'opacity-100' : 'opacity-0'}`}>
                        <TestimonialsColumn
                            testimonials={[
                                { name: 'Carlos M.', role: 'Dono de Imobiliária', text: 'Antes eu perdia leads por não responder rápido. Agora a IA responde em segundos e já agenda a visita.' },
                                { name: 'Juliana R.', role: 'CEO de Startup', text: 'O funil automatizado captura leads que antes perdíamos. Triplicamos nossas conversões em 2 meses.' },
                                { name: 'Marcos T.', role: 'Dono de Academia', text: 'A IA agenda as aulas experimentais sozinha. Minha recepção não perde mais nenhum contato.' },
                            ]}
                            duration={18}
                        />
                        <TestimonialsColumn
                            className="hidden md:block"
                            testimonials={[
                                { name: 'Ana P.', role: 'Gestora de Clínica', text: 'Minha equipe parou de perder tempo com agendamentos manuais. O Backstagefy mudou nossa operação.' },
                                { name: 'Fernando L.', role: 'Diretor Comercial', text: 'Integração com WhatsApp é perfeita. Os leads são qualificados antes de chegar no time de vendas.' },
                                { name: 'Camila S.', role: 'Proprietária de Salão', text: 'Minhas clientes agendam direto pelo WhatsApp. Reduzi 80% das ligações na recepção.' },
                            ]}
                            duration={22}
                        />
                        <TestimonialsColumn
                            className="hidden lg:block"
                            testimonials={[
                                { name: 'Roberto S.', role: 'Corretor Autônomo', text: 'Trabalho sozinho e agora tenho uma assistente 24/7. Meus agendamentos triplicaram.' },
                                { name: 'Luciana A.', role: 'Gerente de Hotel', text: 'O atendimento automatizado responde reservas instantaneamente. Nossa taxa de ocupação subiu 40%.' },
                                { name: 'Paulo H.', role: 'Consultor Financeiro', text: 'Cada lead é qualificado pela IA antes de falar comigo. Só atendo quem realmente quer contratar.' },
                            ]}
                            duration={20}
                        />
                    </div>
                </div>
            </section>

            {/* ═══════════════════ SECTION 7: CTA FINAL ═══════════════════ */}
            <section
                id="cta"
                ref={setRef('cta')}
                className="relative z-10 bg-[#050505] py-24 md:py-32 px-6"
            >
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[150px] rounded-full" />
                </div>

                <div className={`max-w-3xl mx-auto text-center relative z-10 transition-all duration-1000 ${isVisible('cta') ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                    <h2 className="text-3xl md:text-5xl font-heading font-light mb-6">
                        Pronto para automatizar<br />
                        <span className="text-primary">seu bastidor?</span>
                    </h2>
                    <p className="text-white/50 text-lg mb-10">
                        Comece grátis. Sem cartão de crédito. Configure em menos de 5 minutos.
                    </p>

                    <div className="max-w-md mx-auto bg-white/[0.03] border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
                        <form onSubmit={(e) => { e.preventDefault(); onNavigateToLogin() }} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Seu nome"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-primary/40 transition-colors"
                            />
                            <input
                                type="email"
                                placeholder="Seu e-mail"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-primary/40 transition-colors"
                            />
                            <input
                                type="tel"
                                placeholder="WhatsApp (com DDD)"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-primary/40 transition-colors"
                            />
                            <button
                                type="submit"
                                className="w-full backstagefy-btn-primary py-4 rounded-xl text-sm font-bold uppercase tracking-[0.2em] group"
                            >
                                Quero Automatizar Meu Negócio
                                <span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">rocket_launch</span>
                            </button>
                        </form>
                        <p className="text-white/20 text-[10px] mt-4 uppercase tracking-widest">Seus dados estão seguros conosco</p>
                    </div>
                </div>
            </section>

            {/* ═══════════════════ SECTION 8: FOOTER ═══════════════════ */}
            <footer className="relative z-10 bg-[#050505] border-t border-white/5 py-12 px-6 -mt-px">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                <span className="text-primary font-black text-sm">B</span>
                            </div>
                            <span className="font-heading text-white/60 text-lg tracking-tight">BACKSTAGEFY</span>
                        </div>
                        <div className="flex items-center gap-6 text-white/30 text-xs">
                            <span className="hover:text-white/60 transition-colors cursor-pointer">Termos de Uso</span>
                            <span className="hover:text-white/60 transition-colors cursor-pointer">Privacidade</span>
                            <span className="hover:text-white/60 transition-colors cursor-pointer">Contato</span>
                        </div>
                        <p className="text-white/20 text-xs">© 2026 Backstagefy • Todos os direitos reservados</p>
                    </div>
                </div>
            </footer>

            {/* ═══════════════════ GLOBAL STYLES ═══════════════════ */}
            <style>{`
                @keyframes fade-in-up {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 1s ease-out both;
                }
            `}</style>
        </div>
    )
}

export default LandingPage
