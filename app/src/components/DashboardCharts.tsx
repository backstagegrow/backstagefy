import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts'

interface ChartData {
    name: string
    leads: number
}

interface DistributionData {
    name: string
    value: number
    color: string
}

interface DashboardChartsProps {
    weeklyData: ChartData[]
    distributionData: DistributionData[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-bg-dark border border-white/10 p-3 rounded-xl shadow-2xl">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-primary font-bold">{payload[0].value} Leads</p>
            </div>
        )
    }
    return null
}

export default function DashboardCharts({ weeklyData, distributionData }: DashboardChartsProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Weekly Trend */}
            <div className="lg:col-span-2 backstagefy-glass-card p-8 border border-white/[0.03]">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-white text-lg font-heading">Evolução Semanal</h3>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Leads captados nos últimos 7 dias</p>
                    </div>
                    <div className="size-10 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-xl">trending_up</span>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyData}>
                            <defs>
                                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 600 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 600 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="leads"
                                stroke="#22c55e"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorLeads)"
                                animationDuration={2000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Status Distribution */}
            <div className="backstagefy-glass-card p-8 border border-white/[0.03]">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-white text-lg font-heading">Perfil dos Leads</h3>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Distribuição por temperatura</p>
                    </div>
                    <div className="size-10 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-blue-400 text-xl">pie_chart</span>
                    </div>
                </div>

                <div className="h-[200px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={distributionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={8}
                                dataKey="value"
                                animationDuration={1500}
                            >
                                {distributionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-gray-600 uppercase font-bold tracking-widest">Total</span>
                        <span className="text-xl text-white font-heading">
                            {distributionData.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                    </div>
                </div>

                <div className="mt-6 space-y-3">
                    {distributionData.map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{item.name}</span>
                            </div>
                            <span className="text-xs text-white font-mono font-bold">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
