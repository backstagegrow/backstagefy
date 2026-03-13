import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'

/* ═════════════════════════════════════════
   TYPES
   ═════════════════════════════════════════ */
interface PlatformConnection {
    id: string; platform: string; sync_status: string; last_sync_at: string | null; is_active: boolean
}
interface Sale {
    id: string; platform: string; status: string; payment_method: string; amount: number
    buyer_name: string; buyer_email: string; ticket_type: string; sold_at: string
    event_id: string | null; offer_name: string | null; is_order_bump: boolean
    checkin_done?: boolean
}
interface SalesEvent {
    id: string; name: string; platform: string; event_type: string; event_date: string | null
    location: string | null; capacity: number | null; image_url: string | null
    is_active?: boolean
}
interface RecoveryLog {
    id: string; sale_id: string; attempt: number; message_sent: string
    status: string; sent_at: string; converted_at: string | null
}

type Period = '7d' | '30d' | '90d' | 'all'
type PlatformFilter = 'all' | 'hotmart' | 'kiwify' | 'sympla' | 'blinket' | 'eventin'

const PLATFORM_COLORS: Record<string, string> = {
    hotmart: '#F04E23', kiwify: '#00C853', sympla: '#7B2FF7', blinket: '#FF6B00', eventin: '#2196F3'
}
const PLATFORM_LABELS: Record<string, string> = {
    hotmart: 'Hotmart', kiwify: 'Kiwify', sympla: 'Sympla', blinket: 'Blinket', eventin: 'Eventin'
}

/* ═════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════ */
export default function TicketDashboard() {
    const { tenant } = useTenant()
    const [connections, setConnections] = useState<PlatformConnection[]>([])
    const [sales, setSales] = useState<Sale[]>([])
    const [events, setEvents] = useState<SalesEvent[]>([])
    const [recoveryLogs, setRecoveryLogs] = useState<RecoveryLog[]>([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState<Period>('30d')
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
    const [showConnections, setShowConnections] = useState(false)
    const [connectModal, setConnectModal] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [apiSecret, setApiSecret] = useState('')
    const [connecting, setConnecting] = useState(false)

    useEffect(() => { if (tenant?.id) fetchAll() }, [tenant?.id])

    async function fetchAll() {
        setLoading(true)
        const [c, s, e, r] = await Promise.all([
            supabase!.from('platform_connections').select('*').eq('tenant_id', tenant!.id),
            supabase!.from('platform_sales').select('*').eq('tenant_id', tenant!.id).order('sold_at', { ascending: false }),
            supabase!.from('sales_events').select('*').eq('tenant_id', tenant!.id),
            supabase!.from('cart_recovery_logs').select('*').eq('tenant_id', tenant!.id).order('sent_at', { ascending: false }).limit(50)
        ])
        setConnections(c.data || [])
        setSales(s.data || [])
        setEvents(e.data || [])
        setRecoveryLogs(r.data || [])
        setLoading(false)
        if (!c.data?.length) setShowConnections(true)
    }

    /* ─── FILTERS ─── */
    const filteredSales = useMemo(() => {
        let data = sales
        if (platformFilter !== 'all') data = data.filter(s => s.platform === platformFilter)
        const now = Date.now()
        const cutoff = period === '7d' ? now - 7 * 86400000
            : period === '30d' ? now - 30 * 86400000
                : period === '90d' ? now - 90 * 86400000 : 0
        if (cutoff) data = data.filter(s => new Date(s.sold_at).getTime() >= cutoff)
        return data
    }, [sales, period, platformFilter])

    /* ─── KPIs ─── */
    const kpis = useMemo(() => {
        const approved = filteredSales.filter(s => s.status === 'approved')
        const abandoned = filteredSales.filter(s => s.status === 'abandoned')
        const refunded = filteredSales.filter(s => s.status === 'refunded')
        const chargeback = filteredSales.filter(s => s.status === 'chargeback')
        const total = approved.reduce((a, s) => a + Number(s.amount), 0)
        const abandonRate = filteredSales.length ? (abandoned.length / filteredSales.length) * 100 : 0
        const converted = recoveryLogs.filter(l => l.status === 'converted')
        const uniqueRecovered = new Set(converted.map(l => l.sale_id))
        const recoveryRate = abandoned.length > 0 ? (uniqueRecovered.size / abandoned.length) * 100 : 0
        return {
            revenue: total, salesCount: approved.length,
            activeEvents: events.filter(e => e.is_active !== false).length,
            abandonRate: abandonRate.toFixed(1),
            abandonCount: abandoned.length,
            refundCount: refunded.length,
            refundAmount: refunded.reduce((a, s) => a + Number(s.amount), 0),
            chargebackCount: chargeback.length,
            recoveryRate: recoveryRate.toFixed(1),
            recoveredCount: uniqueRecovered.size,
            totalAttempts: recoveryLogs.length,
        }
    }, [filteredSales, events, recoveryLogs])

    /* ─── CHART DATA ─── */
    const chartData = useMemo(() => {
        const approved = filteredSales.filter(s => s.status === 'approved')
        const byDate: Record<string, Record<string, number>> = {}
        approved.forEach(s => {
            const d = new Date(s.sold_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            if (!byDate[d]) byDate[d] = {}
            byDate[d][s.platform] = (byDate[d][s.platform] || 0) + Number(s.amount)
        })
        return Object.entries(byDate).map(([date, platforms]) => ({ date, ...platforms })).reverse()
    }, [filteredSales])

    /* ─── PAYMENT METHODS ─── */
    const paymentMethods = useMemo(() => {
        const approved = filteredSales.filter(s => s.status === 'approved')
        const byMethod: Record<string, { count: number; total: number }> = {}
        approved.forEach(s => {
            const m = s.payment_method || 'Outros'
            if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 }
            byMethod[m].count++
            byMethod[m].total += Number(s.amount)
        })
        return Object.entries(byMethod).map(([method, data]) => ({
            method: method.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
            count: data.count,
            total: data.total,
            pct: approved.length ? ((data.count / approved.length) * 100).toFixed(1) : '0'
        })).sort((a, b) => b.total - a.total)
    }, [filteredSales])

    /* ─── CONNECT PLATFORM ─── */
    async function connectPlatform() {
        if (!connectModal || !tenant?.id) return
        setConnecting(true)
        const { error } = await supabase!.from('platform_connections').upsert({
            tenant_id: tenant.id,
            platform: connectModal,
            credentials: { api_key: apiKey, api_secret: apiSecret },
            sync_status: 'pending',
            is_active: true,
            connected_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,platform' })
        setConnecting(false)
        if (!error) {
            setConnectModal(null)
            setApiKey('')
            setApiSecret('')
            fetchAll()
        }
    }

    async function disconnectPlatform(platform: string) {
        if (!tenant?.id) return
        await supabase!.from('platform_connections').delete().eq('tenant_id', tenant.id).eq('platform', platform)
        fetchAll()
    }

    const activePlatforms = connections.filter(c => c.is_active).map(c => c.platform)

    /* ─── EMPTY STATE ─── */
    if (!loading && !connections.length) {
        return (
            <div className="animate-in fade-in duration-700">
                <EmptyState onConnect={() => setShowConnections(true)} />
                {showConnections && (
                    <PlatformGrid
                        connections={connections}
                        onConnect={setConnectModal}
                        onDisconnect={disconnectPlatform}
                    />
                )}
                {connectModal && (
                    <ConnectModal
                        platform={connectModal}
                        apiKey={apiKey} setApiKey={setApiKey}
                        apiSecret={apiSecret} setApiSecret={setApiSecret}
                        connecting={connecting}
                        onConnect={connectPlatform}
                        onClose={() => { setConnectModal(null); setApiKey(''); setApiSecret('') }}
                    />
                )}
            </div>
        )
    }

    if (loading) return <LoadingState />

    /* ═════════════════════════════════════════
       RENDER — FULL DASHBOARD
       ═════════════════════════════════════════ */
    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* ─── Toolbar ─── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                    {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${period === p
                                ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:border-white/10'
                                }`}>{p === 'all' ? 'Tudo' : p}</button>
                    ))}
                    <div className="w-px h-6 bg-white/5 mx-2" />
                    <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value as PlatformFilter)}
                        className="bg-white/[0.02] border border-white/5 text-gray-400 text-xs rounded-xl px-4 py-2 focus:outline-none focus:border-primary/30">
                        <option value="all">Todas Plataformas</option>
                        {activePlatforms.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                    </select>
                </div>
                <button onClick={() => setShowConnections(!showConnections)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-gray-400 hover:text-white hover:border-white/10 transition-all text-xs font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-sm">settings</span>Plataformas
                </button>
            </div>

            {showConnections && (
                <PlatformGrid connections={connections} onConnect={setConnectModal} onDisconnect={disconnectPlatform} />
            )}

            {/* ─── Block 1: KPIs ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon="payments" label="Total Arrecadado" value={`R$ ${kpis.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="emerald" />
                <KpiCard icon="confirmation_number" label="Vendas Aprovadas" value={kpis.salesCount.toString()} color="blue" />
                <KpiCard icon="event" label="Eventos/Produtos Ativos" value={kpis.activeEvents.toString()} color="violet" />
                <KpiCard icon="remove_shopping_cart" label="Taxa de Abandono" value={`${kpis.abandonRate}%`} color="amber" />
            </div>

            {/* ─── Block 2: Chart + Block 5: Alerts ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-2xl bg-white/[0.02] border border-white/5 p-6">
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">trending_up</span>
                        Vendas ao Longo do Tempo
                    </h3>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData}>
                                <defs>
                                    {activePlatforms.map(p => (
                                        <linearGradient key={p} id={`grad_${p}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.3} />
                                            <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                {activePlatforms.map(p => (
                                    <Area key={p} type="monotone" dataKey={p} name={PLATFORM_LABELS[p]}
                                        stroke={PLATFORM_COLORS[p]} fill={`url(#grad_${p})`} strokeWidth={2} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <NoData label="Sem dados de vendas neste período" />}
                </div>

                {/* ─── Block 5: Alerts ─── */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-6 space-y-4">
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-lg">notifications_active</span>
                        Alertas
                    </h3>
                    <AlertRow icon="remove_shopping_cart" label="Abandonos" value={kpis.abandonCount} color="amber" />
                    <AlertRow icon="undo" label="Reembolsos" value={kpis.refundCount}
                        extra={`R$ ${kpis.refundAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="orange" />
                    <AlertRow icon="gpp_bad" label="Chargebacks" value={kpis.chargebackCount} color="red" />
                    <AlertRow icon="event_busy" label="No-show" value={
                        filteredSales.filter(s => s.status === 'approved' && !s.checkin_done).length
                    } color="gray" />
                </div>
            </div>

            {/* ─── Block 7: Cart Recovery Metrics ─── */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.03] to-transparent border border-emerald-500/10 p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-400 text-lg">smart_toy</span>
                        Recuperação Inteligente (IA)
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${kpis.totalAttempts > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">
                            {kpis.totalAttempts > 0 ? 'Ativo' : 'Aguardando'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <div className="text-center">
                        <p className="text-emerald-400 text-2xl font-bold">{kpis.recoveryRate}%</p>
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Taxa Recuperação</p>
                    </div>
                    <div className="text-center">
                        <p className="text-white text-2xl font-bold">{kpis.recoveredCount}</p>
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Vendas Recuperadas</p>
                    </div>
                    <div className="text-center">
                        <p className="text-blue-400 text-2xl font-bold">{kpis.totalAttempts}</p>
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Tentativas Enviadas</p>
                    </div>
                    <div className="text-center">
                        <p className="text-amber-400 text-2xl font-bold">{kpis.abandonCount}</p>
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Abandonos Detectados</p>
                    </div>
                </div>

                {/* Recovery Timeline */}
                {recoveryLogs.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest font-bold mb-2">Últimas Tentativas</p>
                        {recoveryLogs.slice(0, 8).map(log => {
                            const statusColors: Record<string, string> = {
                                sent: 'text-blue-400 bg-blue-500/10',
                                delivered: 'text-cyan-400 bg-cyan-500/10',
                                read: 'text-emerald-400 bg-emerald-500/10',
                                converted: 'text-primary bg-primary/10',
                                failed: 'text-red-400 bg-red-500/10',
                            }
                            const statusLabels: Record<string, string> = {
                                sent: 'Enviada', delivered: 'Entregue', read: 'Lida',
                                converted: 'Convertida ✓', failed: 'Falhou',
                            }
                            return (
                                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-white/[0.03] last:border-0">
                                    <div className="mt-0.5">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${statusColors[log.status] || 'text-gray-400 bg-white/5'}`}>
                                            {statusLabels[log.status] || log.status}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white/70 text-[11px] truncate italic">"{log.message_sent}"</p>
                                        <p className="text-gray-600 text-[9px] mt-0.5">
                                            Tentativa {log.attempt} · {new Date(log.sent_at).toLocaleString('pt-BR', {
                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <span className="material-symbols-outlined text-3xl text-gray-700 mb-2">psychology</span>
                        <p className="text-gray-600 text-[10px]">A IA está monitorando abandonos. Quando detectar, iniciará recuperação automática via WhatsApp.</p>
                    </div>
                )}
            </div>

            {/* ─── Block 4: Payment Methods ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-6">
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-400 text-lg">credit_card</span>
                        Meios de Pagamento
                    </h3>
                    {paymentMethods.length > 0 ? (
                        <div className="space-y-3">
                            {paymentMethods.map(m => (
                                <div key={m.method} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-sm text-gray-500">
                                            {m.method.toLowerCase().includes('pix') ? 'qr_code_2'
                                                : m.method.toLowerCase().includes('cart') ? 'credit_card'
                                                    : m.method.toLowerCase().includes('bolet') ? 'receipt' : 'payment'}
                                        </span>
                                        <span className="text-white/80 text-xs font-medium">{m.method}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                        <span className="text-primary text-xs font-bold">{m.pct}%</span>
                                        <span className="text-white/60 text-xs">R$ {m.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <NoData label="Nenhum dado de pagamento" />}
                </div>

                {/* ─── Payment Chart ─── */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-6">
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-violet-400 text-lg">bar_chart</span>
                        Distribuição por Pagamento
                    </h3>
                    {paymentMethods.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={paymentMethods} layout="vertical" barSize={16}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                                <YAxis dataKey="method" type="category" tick={{ fill: '#aaa', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="total" fill="#22c55e" radius={[0, 8, 8, 0]} name="Total R$" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <NoData label="Sem dados" />}
                </div>
            </div>

            {/* ─── Block 6: Event/Product Cards ─── */}
            {events.length > 0 && (
                <div>
                    <h3 className="text-white text-sm font-bold tracking-wider uppercase mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">local_activity</span>
                        Eventos & Produtos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {events.map(event => {
                            const eventSales = filteredSales.filter(s => s.event_id === event.id && s.status === 'approved')
                            const revenue = eventSales.reduce((a, s) => a + Number(s.amount), 0)
                            const pct = event.capacity ? Math.min((eventSales.length / event.capacity) * 100, 100) : 0
                            return (
                                <div key={event.id} className="rounded-2xl bg-white/[0.02] border border-white/5 p-5 hover:border-primary/20 transition-all group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{event.event_type === 'event' ? '🎫' : event.event_type === 'course' ? '📚' : '📦'}</span>
                                            <h4 className="text-white text-sm font-bold">{event.name}</h4>
                                        </div>
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                                            style={{ background: `${PLATFORM_COLORS[event.platform]}20`, color: PLATFORM_COLORS[event.platform], border: `1px solid ${PLATFORM_COLORS[event.platform]}40` }}>
                                            {PLATFORM_LABELS[event.platform]}
                                        </span>
                                    </div>

                                    {event.event_date && (
                                        <p className="text-gray-500 text-[10px] flex items-center gap-1 mb-1">
                                            <span className="material-symbols-outlined text-xs">calendar_today</span>
                                            {new Date(event.event_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                    )}
                                    {event.location && (
                                        <p className="text-gray-500 text-[10px] flex items-center gap-1 mb-3">
                                            <span className="material-symbols-outlined text-xs">location_on</span>{event.location}
                                        </p>
                                    )}

                                    {event.capacity && (
                                        <>
                                            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                                                <span>{eventSales.length} / {event.capacity} vendidos</span>
                                                <span className="text-primary font-bold">{pct.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-700"
                                                    style={{ width: `${pct}%` }} />
                                            </div>
                                        </>
                                    )}

                                    <div className="mt-3 pt-3 border-t border-white/[0.03] flex items-center justify-between">
                                        <span className="text-white/70 text-xs">Receita</span>
                                        <span className="text-primary font-bold text-sm">R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ─── Connect Modal ─── */}
            {connectModal && (
                <ConnectModal
                    platform={connectModal}
                    apiKey={apiKey} setApiKey={setApiKey}
                    apiSecret={apiSecret} setApiSecret={setApiSecret}
                    connecting={connecting}
                    onConnect={connectPlatform}
                    onClose={() => { setConnectModal(null); setApiKey(''); setApiSecret('') }}
                />
            )}
        </div>
    )
}

/* ═════════════════════════════════════════
   SUB-COMPONENTS
   ═════════════════════════════════════════ */
function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
    const colors: Record<string, string> = {
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    }
    return (
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-5 hover:border-white/10 transition-all group">
            <div className={`size-10 rounded-xl ${colors[color]} border flex items-center justify-center mb-3`}>
                <span className="material-symbols-outlined text-lg">{icon}</span>
            </div>
            <p className="text-white text-xl md:text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">{label}</p>
        </div>
    )
}

function AlertRow({ icon, label, value, extra, color }: { icon: string; label: string; value: number; extra?: string; color: string }) {
    const cls: Record<string, string> = {
        amber: 'text-amber-400', orange: 'text-orange-400', red: 'text-red-400', gray: 'text-gray-400',
    }
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-white/[0.03] last:border-0">
            <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-base ${cls[color]}`}>{icon}</span>
                <span className="text-white/70 text-xs">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${cls[color]}`}>{value}</span>
                {extra && <span className="text-gray-600 text-[10px]">{extra}</span>}
            </div>
        </div>
    )
}

function PlatformGrid({ connections, onConnect, onDisconnect }: {
    connections: PlatformConnection[]; onConnect: (p: string) => void; onDisconnect: (p: string) => void
}) {
    const platforms = ['hotmart', 'kiwify', 'sympla', 'blinket', 'eventin']
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {platforms.map(p => {
                const conn = connections.find(c => c.platform === p)
                const connected = conn?.is_active
                return (
                    <div key={p}
                        className={`rounded-2xl border p-4 text-center transition-all ${connected
                            ? 'bg-primary/5 border-primary/20' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
                        <div className="size-10 rounded-xl mx-auto mb-2 flex items-center justify-center"
                            style={{ background: `${PLATFORM_COLORS[p]}15`, border: `1px solid ${PLATFORM_COLORS[p]}30` }}>
                            <span className="text-lg font-bold" style={{ color: PLATFORM_COLORS[p] }}>
                                {PLATFORM_LABELS[p][0]}
                            </span>
                        </div>
                        <p className="text-white text-xs font-bold mb-1">{PLATFORM_LABELS[p]}</p>
                        {connected ? (
                            <>
                                <p className="text-primary text-[9px] font-bold uppercase tracking-widest mb-2">Conectada ✓</p>
                                {conn?.last_sync_at && (
                                    <p className="text-gray-600 text-[8px]">
                                        Sync: {new Date(conn.last_sync_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                                <button onClick={() => onDisconnect(p)}
                                    className="mt-2 text-[9px] text-red-400/60 hover:text-red-400 transition-colors">Desconectar</button>
                            </>
                        ) : (
                            <button onClick={() => onConnect(p)}
                                className="mt-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-bold hover:text-white hover:border-white/20 transition-all">
                                Conectar
                            </button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

function ConnectModal({ platform, apiKey, setApiKey, apiSecret, setApiSecret, connecting, onConnect, onClose }: {
    platform: string; apiKey: string; setApiKey: (v: string) => void
    apiSecret: string; setApiSecret: (v: string) => void
    connecting: boolean; onConnect: () => void; onClose: () => void
}) {
    const instructions: Record<string, string> = {
        hotmart: 'Acesse Hotmart → Ferramentas → Credenciais API → Copie o Client ID e Client Secret.',
        kiwify: 'Acesse Kiwify → Configurações → Apps → API → Copie o Account ID e Client Secret.',
        sympla: 'Acesse Sympla → Minha Conta → Integrações → Gere um Token de acesso.',
        blinket: 'Acesse Eduzz → Meu Perfil → Chaves de API → Gere suas credenciais OAuth.',
        eventin: 'Configure um Webhook no Eventin (WordPress) → Advanced → Webhooks → Insira a URL de recebimento.',
    }
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl flex items-center justify-center"
                            style={{ background: `${PLATFORM_COLORS[platform]}15`, border: `1px solid ${PLATFORM_COLORS[platform]}30` }}>
                            <span className="text-lg font-bold" style={{ color: PLATFORM_COLORS[platform] }}>
                                {PLATFORM_LABELS[platform][0]}
                            </span>
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">Conectar {PLATFORM_LABELS[platform]}</h3>
                            <p className="text-gray-500 text-[10px]">Configure a integração</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-white">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-5">
                    <p className="text-blue-300/80 text-[10px] leading-relaxed flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">info</span>
                        {instructions[platform]}
                    </p>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1 block">
                            {platform === 'sympla' ? 'Token de Acesso' : platform === 'kiwify' ? 'Account ID' : 'API Key / Client ID'}
                        </label>
                        <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-primary/40 transition-colors"
                            placeholder="Cole aqui..." />
                    </div>
                    {platform !== 'sympla' && platform !== 'eventin' && (
                        <div>
                            <label className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1 block">
                                {platform === 'kiwify' ? 'Client Secret' : 'API Secret / Client Secret'}
                            </label>
                            <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-primary/40 transition-colors"
                                placeholder="Cole aqui..." />
                        </div>
                    )}
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-xs font-bold hover:text-white transition-all">
                        Cancelar
                    </button>
                    <button onClick={onConnect} disabled={!apiKey || connecting}
                        className="flex-1 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {connecting ? <div className="size-3 border border-primary border-t-transparent rounded-full animate-spin" /> : null}
                        {connecting ? 'Conectando...' : 'Conectar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-[60px]" />
                <div className="size-24 rounded-[2rem] bg-white/[0.02] border border-white/5 flex items-center justify-center relative z-10 shadow-2xl">
                    <span className="material-symbols-outlined text-4xl text-primary/60">store</span>
                </div>
            </div>
            <h3 className="text-white text-xl font-bold mb-2">Central de Vendas</h3>
            <p className="text-gray-500 text-sm max-w-md mb-6 leading-relaxed">
                Conecte suas plataformas de venda (Hotmart, Kiwify, Sympla...) para centralizar todos os dados de vendas,
                ingressos e cursos em um único painel.
            </p>
            <button onClick={onConnect}
                className="backstagefy-btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest">
                <span className="material-symbols-outlined text-sm">add_link</span>
                Conectar Plataforma
            </button>
        </div>
    )
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center py-24">
            <div className="size-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    )
}

function NoData({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined text-3xl text-gray-700 mb-2">inbox</span>
            <p className="text-gray-600 text-xs">{label}</p>
        </div>
    )
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[#111] border border-white/10 rounded-xl p-3 shadow-xl">
            <p className="text-gray-400 text-[10px] font-bold mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
                    {p.name}: <span className="font-bold">R$ {Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </p>
            ))}
        </div>
    )
}
