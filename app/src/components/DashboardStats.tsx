import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import DashboardCharts from './DashboardCharts'

interface Stats {
    totalLeads: number
    leadsThisMonth: number
    scheduledVisits: number
    hotLeads: number
    pipelineTotal: string
    qualificationRate: number
    weeklyLeads: { name: string; leads: number }[]
    distribution: { name: string; value: number; color: string }[]
}

export default function DashboardStats() {
    const { tenantId } = useTenant()
    const [stats, setStats] = useState<Stats>({
        totalLeads: 0,
        leadsThisMonth: 0,
        scheduledVisits: 0,
        hotLeads: 0,
        pipelineTotal: 'R$ 0',
        qualificationRate: 0,
        weeklyLeads: [],
        distribution: []
    })
    const [loading, setLoading] = useState(true)

    const fetchStats = async () => {
        if (!supabase || !tenantId) return

        try {
            // Fetch leads filtered by tenant
            const { data: leads } = await supabase
                .from('leads')
                .select('id, status, pipeline_stage, budget_range, created_at')
                .eq('tenant_id', tenantId)

            // Fetch scheduled appointments for this tenant
            const { data: visits } = await supabase
                .from('appointments')
                .select('id, status')
                .eq('tenant_id', tenantId)
                .in('status', ['confirmed', 'scheduled'])

            if (leads) {
                const now = new Date()
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

                const leadsThisMonth = leads.filter(l => new Date(l.created_at) >= monthStart).length
                const hotLeads = leads.filter(l => l.status === 'quente').length
                const qualifiedLeads = leads.filter(l =>
                    l.pipeline_stage === 'attending' ||
                    l.pipeline_stage === 'scheduled' ||
                    l.pipeline_stage === 'booked' ||
                    l.status === 'quente'
                ).length

                // Calculate pipeline total from budget ranges (A: 35k-60k, B: 60k-100k, C: >100k)
                let pipelineValue = 0
                leads.forEach(l => {
                    if (l.budget_range === 'C') pipelineValue += 100000
                    else if (l.budget_range === 'B') pipelineValue += 70000
                    else if (l.budget_range === 'A') pipelineValue += 45000
                })

                const rate = leads.length > 0 ? Math.round((qualifiedLeads / leads.length) * 100) : 0

                // Aggregate Weekly Data (last 7 days)
                const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                const weeklyLeads = Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date()
                    date.setDate(date.getDate() - (6 - i))
                    const dayLabel = days[date.getDay()]
                    const count = leads.filter(l => {
                        const leadDate = new Date(l.created_at)
                        return leadDate.getDate() === date.getDate() &&
                            leadDate.getMonth() === date.getMonth() &&
                            leadDate.getFullYear() === date.getFullYear()
                    }).length
                    return { name: dayLabel, leads: count }
                })

                // Aggregate Distribution
                const distribution = [
                    { name: 'Frio', value: leads.filter(l => l.status === 'frio').length, color: '#6B7280' },
                    { name: 'Morno', value: leads.filter(l => l.status === 'morno').length, color: '#F59E0B' },
                    { name: 'Quente', value: leads.filter(l => l.status === 'quente').length, color: '#EF4444' }
                ]

                setStats({
                    totalLeads: leads.length,
                    leadsThisMonth,
                    scheduledVisits: visits?.length || 0,
                    hotLeads,
                    pipelineTotal: pipelineValue > 0 ? `R$ ${(pipelineValue / 1000).toFixed(0)}k` : 'R$ 0',
                    qualificationRate: rate,
                    weeklyLeads,
                    distribution
                })
            }
        } catch (err) {
            console.error('Error fetching stats:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (tenantId) fetchStats()

        if (!supabase || !tenantId) return

        const uniqueId = Math.random().toString(36).substring(2, 10)
        const channelName = `stats-updates-${tenantId}-${uniqueId}`

        const channel = supabase.channel(channelName)
            .on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table: 'leads', filter: `tenant_id=eq.${tenantId}` },
                fetchStats
            )
            .on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}` },
                fetchStats
            )
            .subscribe()

        return () => {
            if (supabase) supabase.removeChannel(channel)
        }
    }, [tenantId])

    const statCards = [
        {
            icon: 'groups',
            iconColor: 'text-primary',
            value: stats.leadsThisMonth,
            label: 'Leads este mês',
            change: stats.leadsThisMonth > 0 ? `+${stats.leadsThisMonth}` : null,
            changeColor: 'text-green-400 bg-green-500/10'
        },
        {
            icon: 'calendar_month',
            iconColor: 'text-amber-400',
            value: stats.scheduledVisits,
            label: 'Visitas agendadas',
            change: stats.scheduledVisits > 0 ? `${stats.scheduledVisits}` : null,
            changeColor: 'text-amber-400 bg-amber-500/10'
        },
        {
            icon: 'attach_money',
            iconColor: 'text-green-400',
            value: stats.pipelineTotal,
            label: 'Pipeline total',
            change: null,
            changeColor: ''
        },
        {
            icon: 'local_fire_department',
            iconColor: 'text-red-400',
            value: stats.hotLeads,
            label: 'Leads quentes',
            change: stats.hotLeads > 0 ? '🔥' : null,
            changeColor: 'text-red-400 bg-red-500/10'
        }
    ]

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, i) => (
                    <div key={i} className="backstagefy-glass-card p-6 border border-white/[0.03] hover:border-primary/20 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className={`material-symbols-outlined ${card.iconColor} text-2xl`}>{card.icon}</span>
                            {card.change && (
                                <span className={`text-xs font-bold ${card.changeColor} px-2 py-1 rounded`}>{card.change}</span>
                            )}
                        </div>
                        <p className="text-3xl font-heading font-light text-white">
                            {loading ? '...' : card.value}
                        </p>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="backstagefy-glass-card p-6 border border-white/[0.03]">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-blue-400 text-xl">smart_toy</span>
                        </div>
                        <div>
                            <p className="text-2xl font-heading text-white">{loading ? '...' : `${stats.qualificationRate}%`}</p>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa de qualificação</p>
                        </div>
                    </div>
                </div>

                <div className="backstagefy-glass-card p-6 border border-white/[0.03]">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-xl">database</span>
                        </div>
                        <div>
                            <p className="text-2xl font-heading text-white">{loading ? '...' : stats.totalLeads}</p>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Total de leads</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dashboard Analytics Charts */}
            {!loading && (
                <DashboardCharts
                    weeklyData={stats.weeklyLeads}
                    distributionData={stats.distribution}
                />
            )}
        </div>
    )
}
