import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { useTenant } from '../context/TenantContext'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface Category {
    id: string; name: string; type: string; icon: string; color: string; is_active: boolean
}
interface Product {
    id: string; name: string; description: string | null; type: string
    unit: string; custom_unit: string | null; unit_price: number
    cost_price: number; is_active: boolean; category_id: string | null
    created_at: string
}
interface Transaction {
    id: string; type: string; status: string; description: string
    amount: number; due_date: string; paid_date: string | null
    category_id: string | null; contact_name: string | null
    contact_email: string | null; contact_phone: string | null
    notes: string | null; attachment_url: string | null; created_at: string
}

type SubTab = 'dashboard' | 'transactions' | 'catalog'
type TxFilter = 'all' | 'income' | 'expense'
type Period = '7d' | '30d' | '90d' | 'all'

const UNIT_LABELS: Record<string, string> = {
    un: 'Unidade', m: 'Metro', m2: 'Metro²', kg: 'Quilo', hr: 'Hora',
    pct: 'Pacote', rolo: 'Rolo', pc: 'Peça', cx: 'Caixa', l: 'Litro', custom: 'Personalizada'
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    product: { label: 'Produto', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    service: { label: 'Serviço', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    fee: { label: 'Taxa', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' }
}

const STATUS_BADGES: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pendente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: 'schedule' },
    paid: { label: 'Pago', color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: 'check_circle' },
    overdue: { label: 'Vencido', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: 'error' },
    cancelled: { label: 'Cancelado', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30', icon: 'cancel' }
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

/* ═══════════════════════════════════════════════════════
   CUSTOM TOOLTIP
   ═══════════════════════════════════════════════════════ */
const ChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
        return (
            <div className="bg-[#0a0a0a] border border-white/10 p-3 rounded-xl shadow-2xl">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} className="font-bold text-sm" style={{ color: p.color }}>{fmt(p.value)}</p>
                ))}
            </div>
        )
    }
    return null
}

/* ═══════════════════════════════════════════════════════
   MODAL COMPONENT
   ═══════════════════════════════════════════════════════ */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#0c0c0e] border border-white/[0.06] rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-white/[0.04]">
                    <h3 className="text-white text-lg font-heading">{title}</h3>
                    <button onClick={onClose} className="size-9 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">{children}</div>
            </div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">{label}</label>
            {children}
        </div>
    )
}

const inputCls = "w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary/40 transition-colors placeholder-gray-600"
const selectCls = inputCls + " appearance-none"

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function FinanceDashboard() {
    const { tenant, tenantId } = useTenant()
    const [subTab, setSubTab] = useState<SubTab>('dashboard')
    const [loading, setLoading] = useState(true)

    // Data
    const [categories, setCategories] = useState<Category[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [transactions, setTransactions] = useState<Transaction[]>([])

    // Filters
    const [txFilter, setTxFilter] = useState<TxFilter>('all')
    const [period, setPeriod] = useState<Period>('30d')
    const [searchTerm, setSearchTerm] = useState('')

    // Modals
    const [txModal, setTxModal] = useState<{ open: boolean; type: 'income' | 'expense'; editing?: Transaction }>({ open: false, type: 'income' })
    const [prodModal, setProdModal] = useState<{ open: boolean; editing?: Product }>({ open: false })

    // Form state – Transaction
    const [txForm, setTxForm] = useState({ description: '', amount: '', due_date: '', category_id: '', contact_name: '', notes: '' })
    // Form state – Product
    const [prodForm, setProdForm] = useState({ name: '', description: '', type: 'product', unit: 'un', custom_unit: '', unit_price: '', cost_price: '' })
    const [saving, setSaving] = useState(false)

    // AI Scanner
    const [scanModal, setScanModal] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [scanPreview, setScanPreview] = useState<string | null>(null)
    const [scanResult, setScanResult] = useState<{ type: 'income' | 'expense'; description: string; amount: string; date: string; category_hint: string; contact: string; confidence: number; summary: string } | null>(null)
    const [scanError, setScanError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    /* ── FETCH ALL ── */
    const fetchAll = async () => {
        if (!supabase || !tenantId) return
        setLoading(true)
        try {
            const [c, p, t] = await Promise.all([
                supabase.from('fin_categories').select('*').eq('tenant_id', tenantId).order('name'),
                supabase.from('fin_products').select('*').eq('tenant_id', tenantId).order('name'),
                supabase.from('fin_transactions').select('*').eq('tenant_id', tenantId).order('due_date', { ascending: false })
            ])
            setCategories(c.data || [])
            setProducts(p.data || [])
            setTransactions(t.data || [])
        } catch (err) {
            console.error('Finance fetch error:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (tenantId) {
            fetchAll()
            // seed default categories if empty
            supabase!.rpc('seed_fin_categories', { p_tenant_id: tenantId }).then(() => {
                supabase!.from('fin_categories').select('*').eq('tenant_id', tenantId).order('name').then(r => {
                    if (r.data?.length) setCategories(r.data)
                })
            })
        }
    }, [tenantId])

    // Real-time
    useEffect(() => {
        if (!supabase || !tenantId) return
        const ch = supabase.channel('finance-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions' }, fetchAll)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_products' }, fetchAll)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_categories' }, fetchAll)
            .subscribe()
        return () => { supabase!.removeChannel(ch) }
    }, [tenantId])

    /* ── FILTERED TRANSACTIONS ── */
    const filteredTx = useMemo(() => {
        let data = transactions
        if (txFilter !== 'all') data = data.filter(t => t.type === txFilter)
        if (period !== 'all') {
            const now = Date.now()
            const ms = period === '7d' ? 7 * 86400000 : period === '30d' ? 30 * 86400000 : 90 * 86400000
            data = data.filter(t => new Date(t.due_date).getTime() >= now - ms)
        }
        if (searchTerm) {
            const s = searchTerm.toLowerCase()
            data = data.filter(t => t.description.toLowerCase().includes(s) || t.contact_name?.toLowerCase().includes(s))
        }
        return data
    }, [transactions, txFilter, period, searchTerm])

    /* ── KPIs ── */
    const kpis = useMemo(() => {
        const now = Date.now()
        const ms = period === '7d' ? 7 * 86400000 : period === '30d' ? 30 * 86400000 : period === '90d' ? 90 * 86400000 : 0
        const periodTx = ms ? transactions.filter(t => new Date(t.due_date).getTime() >= now - ms) : transactions

        const income = periodTx.filter(t => t.type === 'income' && t.status === 'paid').reduce((a, t) => a + Number(t.amount), 0)
        const expense = periodTx.filter(t => t.type === 'expense' && t.status === 'paid').reduce((a, t) => a + Number(t.amount), 0)
        const balance = income - expense
        const overdue = periodTx.filter(t => t.status === 'overdue' || (t.status === 'pending' && new Date(t.due_date) < new Date())).length
        const pending = periodTx.filter(t => t.status === 'pending').reduce((a, t) => a + Number(t.amount), 0)
        return { income, expense, balance, overdue, pending }
    }, [transactions, period])

    /* ── CHART DATA ── */
    const chartData = useMemo(() => {
        const months: Record<string, { income: number; expense: number }> = {}
        const mNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        // last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            months[key] = { income: 0, expense: 0 }
        }
        transactions.filter(t => t.status === 'paid').forEach(t => {
            const d = new Date(t.due_date)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (months[key]) {
                if (t.type === 'income') months[key].income += Number(t.amount)
                else months[key].expense += Number(t.amount)
            }
        })
        return Object.entries(months).map(([k, v]) => ({
            name: mNames[parseInt(k.split('-')[1]) - 1],
            receita: v.income,
            despesa: v.expense
        }))
    }, [transactions])

    const categoryData = useMemo(() => {
        const map: Record<string, { name: string; value: number; color: string }> = {}
        transactions.filter(t => t.status === 'paid').forEach(t => {
            const cat = categories.find(c => c.id === t.category_id)
            const catName = cat?.name || 'Sem Categoria'
            const catColor = cat?.color || '#6B7280'
            if (!map[catName]) map[catName] = { name: catName, value: 0, color: catColor }
            map[catName].value += Number(t.amount)
        })
        return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 6)
    }, [transactions, categories])

    const upcomingDue = useMemo(() => {
        return transactions
            .filter(t => t.status === 'pending' && new Date(t.due_date) >= new Date())
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
            .slice(0, 5)
    }, [transactions])

    /* ── SAVE TRANSACTION ── */
    const saveTx = async () => {
        if (!supabase || !tenantId || !txForm.description || !txForm.amount || !txForm.due_date) return
        setSaving(true)
        try {
            const payload = {
                tenant_id: tenantId,
                type: txModal.type,
                description: txForm.description,
                amount: parseFloat(txForm.amount.replace(/[^\d.,]/g, '').replace(',', '.')),
                due_date: txForm.due_date,
                category_id: txForm.category_id || null,
                contact_name: txForm.contact_name || null,
                notes: txForm.notes || null,
                status: 'pending' as const
            }
            if (txModal.editing) {
                await supabase.from('fin_transactions').update(payload).eq('id', txModal.editing.id)
            } else {
                await supabase.from('fin_transactions').insert(payload)
            }
            setTxModal({ open: false, type: 'income' })
            setTxForm({ description: '', amount: '', due_date: '', category_id: '', contact_name: '', notes: '' })
            fetchAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    /* ── MARK AS PAID ── */
    const markPaid = async (id: string) => {
        if (!supabase) return
        await supabase.from('fin_transactions').update({
            status: 'paid',
            paid_date: new Date().toISOString().slice(0, 10)
        }).eq('id', id)
        fetchAll()
    }

    /* ── DELETE TRANSACTION ── */
    const deleteTx = async (id: string) => {
        if (!supabase) return
        await supabase.from('fin_transactions').delete().eq('id', id)
        fetchAll()
    }

    /* ── SAVE PRODUCT ── */
    const saveProd = async () => {
        if (!supabase || !tenantId || !prodForm.name || !prodForm.unit_price) return
        setSaving(true)
        try {
            const payload = {
                tenant_id: tenantId,
                name: prodForm.name,
                description: prodForm.description || null,
                type: prodForm.type,
                unit: prodForm.unit,
                custom_unit: prodForm.unit === 'custom' ? prodForm.custom_unit : null,
                unit_price: parseFloat(prodForm.unit_price.replace(/[^\d.,]/g, '').replace(',', '.')),
                cost_price: prodForm.cost_price ? parseFloat(prodForm.cost_price.replace(/[^\d.,]/g, '').replace(',', '.')) : 0,
                is_active: true
            }
            if (prodModal.editing) {
                await supabase.from('fin_products').update(payload).eq('id', prodModal.editing.id)
            } else {
                await supabase.from('fin_products').insert(payload)
            }
            setProdModal({ open: false })
            setProdForm({ name: '', description: '', type: 'product', unit: 'un', custom_unit: '', unit_price: '', cost_price: '' })
            fetchAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    /* ── DELETE PRODUCT ── */
    const deleteProd = async (id: string) => {
        if (!supabase) return
        await supabase.from('fin_products').delete().eq('id', id)
        fetchAll()
    }

    /* ── OPEN EDIT TRANSACTION ── */
    const openEditTx = (tx: Transaction) => {
        setTxForm({
            description: tx.description,
            amount: String(tx.amount),
            due_date: tx.due_date,
            category_id: tx.category_id || '',
            contact_name: tx.contact_name || '',
            notes: tx.notes || ''
        })
        setTxModal({ open: true, type: tx.type as 'income' | 'expense', editing: tx })
    }

    /* ── OPEN EDIT PRODUCT ── */
    const openEditProd = (p: Product) => {
        setProdForm({
            name: p.name,
            description: p.description || '',
            type: p.type,
            unit: p.unit,
            custom_unit: p.custom_unit || '',
            unit_price: String(p.unit_price),
            cost_price: String(p.cost_price)
        })
        setProdModal({ open: true, editing: p })
    }

    /* ── AI DOCUMENT SCANNER ── */
    const analyzeDocument = useCallback(async (file: File) => {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY
        if (!geminiKey) {
            setScanError('Chave da API Gemini não configurada. Adicione VITE_GEMINI_API_KEY no .env')
            return
        }

        setScanning(true)
        setScanError(null)
        setScanResult(null)

        // Generate preview
        const reader = new FileReader()
        reader.onload = (e) => setScanPreview(e.target?.result as string)
        reader.readAsDataURL(file)

        try {
            const genAI = new GoogleGenerativeAI(geminiKey)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            // Convert file to base64
            const arrayBuffer = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

            const prompt = `Analise este documento financeiro (cupom fiscal, nota fiscal, contrato, recibo, fatura, boleto, etc).

RETORNE APENAS um JSON válido, sem markdown, sem backticks, no seguinte formato:
{
  "type": "income" ou "expense" (receita ou despesa),
  "description": "descrição concisa do documento",
  "amount": "valor total em formato numérico (ex: 1234.56)",
  "date": "data no formato YYYY-MM-DD (se encontrada, senão use a data de hoje)",
  "category_hint": "categoria sugerida: Material, Serviço Terceirizado, Aluguel, Equipamento, Transporte, Marketing, Alimentação, Escritório, Impostos, Venda de Produto, Serviço Prestado, Consultoria, Comissão, Patrocínio, ou outra",
  "contact": "nome do fornecedor ou cliente (se encontrado)",
  "confidence": 0.0 a 1.0 (qual a confiança na classificação),
  "summary": "resumo curto do que foi identificado no documento"
}

Regras:
- Se for uma COMPRA, PAGAMENTO, DESPESA, nota de serviço recebido → type = "expense"
- Se for uma VENDA, RECEBIMENTO, contrato de prestação de serviço → type = "income"
- Cupom fiscal de compra = expense. Nota fiscal de venda = income.
- Contrato onde VOCÊ presta serviço = income. Contrato onde VOCÊ contrata = expense.
- Se não encontrar data, use: ${new Date().toISOString().slice(0, 10)}
- Se não encontrar valor, coloque "0"
- RETORNE APENAS O JSON, nada mais.`

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        mimeType: file.type || 'image/jpeg',
                        data: base64
                    }
                }
            ])

            const text = result.response.text().trim()
            // Clean potential markdown wrapping
            const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
            const parsed = JSON.parse(jsonStr)

            setScanResult({
                type: parsed.type === 'income' ? 'income' : 'expense',
                description: parsed.description || '',
                amount: String(parsed.amount || '0'),
                date: parsed.date || new Date().toISOString().slice(0, 10),
                category_hint: parsed.category_hint || '',
                contact: parsed.contact || '',
                confidence: Number(parsed.confidence) || 0,
                summary: parsed.summary || ''
            })
        } catch (err: any) {
            console.error('AI scan error:', err)
            setScanError(err.message || 'Erro ao analisar documento. Tente novamente.')
        } finally {
            setScanning(false)
        }
    }, [])

    const applyScanResult = () => {
        if (!scanResult) return
        // Try to match category by name
        const matchedCat = categories.find(c =>
            c.name.toLowerCase().includes(scanResult.category_hint.toLowerCase()) ||
            scanResult.category_hint.toLowerCase().includes(c.name.toLowerCase())
        )
        setTxForm({
            description: scanResult.description,
            amount: scanResult.amount,
            due_date: scanResult.date,
            category_id: matchedCat?.id || '',
            contact_name: scanResult.contact,
            notes: `[IA] ${scanResult.summary} (Confiança: ${Math.round(scanResult.confidence * 100)}%)`
        })
        setTxModal({ open: true, type: scanResult.type })
        setScanModal(false)
        setScanResult(null)
        setScanPreview(null)
    }

    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
            analyzeDocument(file)
        }
    }, [analyzeDocument])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) analyzeDocument(file)
    }, [analyzeDocument])

    /* ═══════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════ */

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin size-10 border-2 border-primary/20 border-t-primary rounded-full" />
            </div>
        )
    }

    const subTabs = [
        { id: 'dashboard' as const, icon: 'analytics', label: 'Dashboard' },
        { id: 'transactions' as const, icon: 'receipt_long', label: 'Lançamentos' },
        { id: 'catalog' as const, icon: 'inventory_2', label: 'Catálogo' }
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Sub-Tab Navigation */}
            <div className="flex items-center gap-2 p-1 bg-white/[0.02] border border-white/[0.04] rounded-2xl w-fit">
                {subTabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                            subTab === t.id
                                ? 'bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/5'
                                : 'text-gray-500 hover:text-white hover:bg-white/[0.03] border border-transparent'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base" style={subTab === t.id ? { fontVariationSettings: "'FILL' 1" } : {}}>{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {/* ═══════ DASHBOARD ═══════ */}
            {subTab === 'dashboard' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    {/* Period Filter */}
                    <div className="flex items-center gap-2">
                        {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                                    period === p ? 'bg-primary/10 text-primary border border-primary/20' : 'text-gray-500 hover:text-white border border-transparent'
                                }`}
                            >
                                {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : p === '90d' ? '90 dias' : 'Tudo'}
                            </button>
                        ))}
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { icon: 'trending_up', iconColor: 'text-green-400', label: 'Receita Total', value: fmt(kpis.income), accent: 'border-green-500/10' },
                            { icon: 'trending_down', iconColor: 'text-red-400', label: 'Despesa Total', value: fmt(kpis.expense), accent: 'border-red-500/10' },
                            { icon: 'account_balance_wallet', iconColor: kpis.balance >= 0 ? 'text-primary' : 'text-red-400', label: 'Saldo', value: fmt(kpis.balance), accent: kpis.balance >= 0 ? 'border-primary/10' : 'border-red-500/10' },
                            { icon: 'warning', iconColor: 'text-amber-400', label: 'Contas Vencidas', value: String(kpis.overdue), accent: kpis.overdue > 0 ? 'border-amber-500/20' : 'border-white/[0.03]' }
                        ].map((c, i) => (
                            <div key={i} className={`backstagefy-glass-card p-6 border ${c.accent} hover:border-primary/20 transition-all`}>
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`material-symbols-outlined ${c.iconColor} text-2xl`}>{c.icon}</span>
                                    {c.icon === 'warning' && kpis.overdue > 0 && (
                                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30 animate-pulse">ATENÇÃO</span>
                                    )}
                                </div>
                                <p className="text-2xl lg:text-3xl font-heading font-light text-white">{c.value}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{c.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Cash Flow Chart */}
                        <div className="lg:col-span-2 backstagefy-glass-card p-6 lg:p-8 border border-white/[0.03]">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-white text-lg font-heading">Fluxo de Caixa</h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Últimos 6 meses</p>
                                </div>
                                <div className="size-10 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary text-lg">monitoring</span>
                                </div>
                            </div>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} barGap={4}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 600 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 600 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Bar dataKey="receita" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={32} />
                                        <Bar dataKey="despesa" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={32} opacity={0.7} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex items-center justify-center gap-6 mt-4">
                                <div className="flex items-center gap-2"><div className="size-2.5 rounded-full bg-green-500" /><span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Receita</span></div>
                                <div className="flex items-center gap-2"><div className="size-2.5 rounded-full bg-red-500" /><span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Despesa</span></div>
                            </div>
                        </div>

                        {/* Category Pie */}
                        <div className="backstagefy-glass-card p-6 lg:p-8 border border-white/[0.03]">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-white text-lg font-heading">Por Categoria</h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Distribuição</p>
                                </div>
                                <div className="size-10 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-blue-400 text-lg">pie_chart</span>
                                </div>
                            </div>
                            {categoryData.length > 0 ? (
                                <>
                                    <div className="h-[180px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={6} dataKey="value" animationDuration={1500}>
                                                    {categoryData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                                                </Pie>
                                                <Tooltip content={<ChartTooltip />} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {categoryData.map((c, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{c.name}</span>
                                                </div>
                                                <span className="text-xs text-white font-mono font-bold">{fmt(c.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="h-[200px] flex items-center justify-center text-gray-600 text-xs">Sem dados ainda</div>
                            )}
                        </div>
                    </div>

                    {/* Upcoming Due */}
                    {upcomingDue.length > 0 && (
                        <div className="backstagefy-glass-card p-6 border border-white/[0.03]">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="material-symbols-outlined text-amber-400 text-xl">event_upcoming</span>
                                <h3 className="text-white font-heading">Próximos Vencimentos</h3>
                            </div>
                            <div className="space-y-2">
                                {upcomingDue.map(t => (
                                    <div key={t.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:border-primary/10 transition-all">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`material-symbols-outlined text-lg ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                {t.type === 'income' ? 'arrow_downward' : 'arrow_upward'}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-white text-sm font-medium truncate">{t.description}</p>
                                                <p className="text-[10px] text-gray-500">{fmtDate(t.due_date)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-mono font-bold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                {t.type === 'income' ? '+' : '-'}{fmt(Number(t.amount))}
                                            </span>
                                            <button onClick={() => markPaid(t.id)} className="size-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 hover:bg-green-500/20 transition-all" title="Marcar como pago">
                                                <span className="material-symbols-outlined text-sm">check</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Amount */}
                    {kpis.pending > 0 && (
                        <div className="backstagefy-glass-card p-6 border border-amber-500/10">
                            <div className="flex items-center gap-4">
                                <div className="size-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-400 text-xl">hourglass_top</span>
                                </div>
                                <div>
                                    <p className="text-2xl font-heading text-white">{fmt(kpis.pending)}</p>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Total pendente</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ TRANSACTIONS ═══════ */}
            {subTab === 'transactions' && (
                <div className="space-y-4 animate-in fade-in duration-500">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            {(['all', 'income', 'expense'] as TxFilter[]).map(f => (
                                <button key={f} onClick={() => setTxFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        txFilter === f ? 'bg-primary/10 text-primary border border-primary/20' : 'text-gray-500 hover:text-white border border-transparent'
                                    }`}
                                >
                                    {f === 'all' ? 'Todos' : f === 'income' ? '↓ Receitas' : '↑ Despesas'}
                                </button>
                            ))}
                            <div className="hidden sm:flex items-center gap-1 ml-2">
                                {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
                                    <button key={p} onClick={() => setPeriod(p)}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                                            period === p ? 'bg-white/[0.06] text-white' : 'text-gray-600 hover:text-gray-400'
                                        }`}
                                    >
                                        {p === 'all' ? '∞' : p}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="flex-1 sm:w-52 flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 focus-within:border-primary/30 transition-colors">
                                <span className="material-symbols-outlined text-gray-600 text-sm">search</span>
                                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent border-none text-white text-xs w-full ml-2 focus:outline-none placeholder-gray-600" placeholder="Buscar..." />
                            </div>
                            {/* AI Scanner Button */}
                            <button onClick={() => { setScanModal(true); setScanResult(null); setScanPreview(null); setScanError(null) }}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:from-cyan-500/20 hover:to-blue-500/20 transition-all shadow-lg shadow-cyan-500/5 group">
                                <span className="material-symbols-outlined text-sm group-hover:animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>document_scanner</span>
                                <span className="hidden lg:inline">IA Scanner</span>
                            </button>
                            <button onClick={() => { setTxForm({ description: '', amount: '', due_date: '', category_id: '', contact_name: '', notes: '' }); setTxModal({ open: true, type: 'income' }) }}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500/20 transition-all">
                                <span className="material-symbols-outlined text-sm">add</span>Receita
                            </button>
                            <button onClick={() => { setTxForm({ description: '', amount: '', due_date: '', category_id: '', contact_name: '', notes: '' }); setTxModal({ open: true, type: 'expense' }) }}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all">
                                <span className="material-symbols-outlined text-sm">add</span>Despesa
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    {filteredTx.length === 0 ? (
                        <div className="backstagefy-glass-card p-12 border border-white/[0.03] text-center">
                            <span className="material-symbols-outlined text-4xl text-gray-700 mb-3 block">receipt_long</span>
                            <p className="text-gray-500 text-sm">Nenhum lançamento encontrado</p>
                            <p className="text-gray-600 text-xs mt-1">Crie uma receita ou despesa usando os botões acima</p>
                        </div>
                    ) : (
                        <div className="backstagefy-glass-card border border-white/[0.03] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/[0.04]">
                                            <th className="text-left px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Tipo</th>
                                            <th className="text-left px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Descrição</th>
                                            <th className="text-left px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest hidden md:table-cell">Categoria</th>
                                            <th className="text-left px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Vencimento</th>
                                            <th className="text-right px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Valor</th>
                                            <th className="text-center px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Status</th>
                                            <th className="text-center px-5 py-3 text-[9px] text-gray-500 font-bold uppercase tracking-widest">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTx.map(tx => {
                                            const cat = categories.find(c => c.id === tx.category_id)
                                            const st = STATUS_BADGES[tx.status] || STATUS_BADGES.pending
                                            const isOverdue = tx.status === 'pending' && new Date(tx.due_date) < new Date()
                                            const effectiveSt = isOverdue ? STATUS_BADGES.overdue : st
                                            return (
                                                <tr key={tx.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                                                    <td className="px-5 py-3">
                                                        <span className={`material-symbols-outlined text-lg ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                            {tx.type === 'income' ? 'south_west' : 'north_east'}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <p className="text-white text-sm font-medium">{tx.description}</p>
                                                        {tx.contact_name && <p className="text-gray-600 text-[10px]">{tx.contact_name}</p>}
                                                    </td>
                                                    <td className="px-5 py-3 hidden md:table-cell">
                                                        {cat ? (
                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border" style={{ color: cat.color, borderColor: cat.color + '33', backgroundColor: cat.color + '15' }}>{cat.name}</span>
                                                        ) : <span className="text-gray-600 text-[10px]">—</span>}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className="text-gray-400 text-xs font-mono">{fmtDate(tx.due_date)}</span>
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        <span className={`text-sm font-mono font-bold ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                            {tx.type === 'income' ? '+' : '-'}{fmt(Number(tx.amount))}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${effectiveSt.color}`}>
                                                            <span className="material-symbols-outlined text-xs">{effectiveSt.icon}</span>
                                                            {effectiveSt.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {(tx.status === 'pending' || isOverdue) && (
                                                                <button onClick={() => markPaid(tx.id)} className="size-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 hover:bg-green-500/20 transition-all" title="Marcar como pago">
                                                                    <span className="material-symbols-outlined text-xs">check</span>
                                                                </button>
                                                            )}
                                                            <button onClick={() => openEditTx(tx)} className="size-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white transition-all" title="Editar">
                                                                <span className="material-symbols-outlined text-xs">edit</span>
                                                            </button>
                                                            <button onClick={() => deleteTx(tx.id)} className="size-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-red-400 transition-all" title="Excluir">
                                                                <span className="material-symbols-outlined text-xs">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ CATALOG ═══════ */}
            {subTab === 'catalog' && (
                <div className="space-y-4 animate-in fade-in duration-500">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 max-w-xs flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 focus-within:border-primary/30 transition-colors">
                            <span className="material-symbols-outlined text-gray-600 text-sm">search</span>
                            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent border-none text-white text-xs w-full ml-2 focus:outline-none placeholder-gray-600" placeholder="Buscar produto ou serviço..." />
                        </div>
                        <button onClick={() => { setProdForm({ name: '', description: '', type: 'product', unit: 'un', custom_unit: '', unit_price: '', cost_price: '' }); setProdModal({ open: true }) }}
                            className="backstagefy-btn-primary !px-4 !py-2.5 !rounded-xl text-[10px] !font-bold uppercase tracking-widest">
                            <span className="material-symbols-outlined text-sm">add</span>
                            <span className="hidden sm:inline">Novo Item</span>
                        </button>
                    </div>

                    {/* Grid */}
                    {products.length === 0 ? (
                        <div className="backstagefy-glass-card p-12 border border-white/[0.03] text-center">
                            <span className="material-symbols-outlined text-4xl text-gray-700 mb-3 block">inventory_2</span>
                            <p className="text-gray-500 text-sm">Nenhum produto ou serviço cadastrado</p>
                            <p className="text-gray-600 text-xs mt-1">Adicione itens ao catálogo para usar nos lançamentos e orçamentos</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {products
                                .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(p => {
                                    const typeInfo = TYPE_LABELS[p.type] || TYPE_LABELS.product
                                    return (
                                        <div key={p.id} className="backstagefy-glass-card p-5 border border-white/[0.03] hover:border-primary/20 transition-all group">
                                            <div className="flex items-start justify-between mb-3">
                                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${typeInfo.bg} ${typeInfo.color}`}>
                                                    {typeInfo.label}
                                                </span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openEditProd(p)} className="size-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white transition-all">
                                                        <span className="material-symbols-outlined text-xs">edit</span>
                                                    </button>
                                                    <button onClick={() => deleteProd(p.id)} className="size-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-red-400 transition-all">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <h4 className="text-white text-sm font-bold mb-1">{p.name}</h4>
                                            {p.description && <p className="text-gray-500 text-[10px] mb-3 line-clamp-2">{p.description}</p>}
                                            <div className="flex items-end justify-between mt-auto pt-3 border-t border-white/[0.03]">
                                                <div>
                                                    <p className="text-primary text-lg font-heading font-light">{fmt(Number(p.unit_price))}</p>
                                                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">
                                                        por {p.unit === 'custom' ? (p.custom_unit || 'un') : UNIT_LABELS[p.unit] || p.unit}
                                                    </p>
                                                </div>
                                                {p.type === 'product' && (
                                                    <span className="text-[9px] text-gray-600 font-mono uppercase">{UNIT_LABELS[p.unit] || p.unit}</span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ TRANSACTION MODAL ═══════ */}
            <Modal open={txModal.open} onClose={() => setTxModal({ open: false, type: 'income' })}
                title={`${txModal.editing ? 'Editar' : 'Nova'} ${txModal.type === 'income' ? 'Receita' : 'Despesa'}`}
            >
                <Field label="Descrição">
                    <input value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Ex: Pagamento de tecido..." />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor (R$)">
                        <input value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} placeholder="0,00" />
                    </Field>
                    <Field label="Vencimento">
                        <input type="date" value={txForm.due_date} onChange={e => setTxForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} />
                    </Field>
                </div>
                <Field label="Categoria">
                    <select value={txForm.category_id} onChange={e => setTxForm(f => ({ ...f, category_id: e.target.value }))} className={selectCls}>
                        <option value="">Sem categoria</option>
                        {categories.filter(c => c.type === txModal.type || c.type === 'both').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Cliente / Fornecedor">
                    <input value={txForm.contact_name} onChange={e => setTxForm(f => ({ ...f, contact_name: e.target.value }))} className={inputCls} placeholder="Nome (opcional)" />
                </Field>
                <Field label="Observações">
                    <textarea value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} className={inputCls + " min-h-[60px] resize-none"} placeholder="Notas adicionais..." />
                </Field>
                <button onClick={saveTx} disabled={saving || !txForm.description || !txForm.amount || !txForm.due_date}
                    className="w-full backstagefy-btn-primary !py-3.5 !rounded-xl disabled:opacity-30 disabled:cursor-not-allowed">
                    {saving ? <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span> : (
                        <><span className="material-symbols-outlined text-lg">save</span>Salvar</>
                    )}
                </button>
            </Modal>

            {/* ═══════ PRODUCT MODAL ═══════ */}
            <Modal open={prodModal.open} onClose={() => setProdModal({ open: false })}
                title={prodModal.editing ? 'Editar Item' : 'Novo Item'}
            >
                <Field label="Nome">
                    <input value={prodForm.name} onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ex: Tecido Voil" />
                </Field>
                <Field label="Tipo">
                    <div className="flex gap-2">
                        {(['product', 'service', 'fee'] as const).map(t => (
                            <button key={t} onClick={() => setProdForm(f => ({ ...f, type: t, unit: t === 'service' ? 'hr' : t === 'fee' ? 'pct' : 'un' }))}
                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                                    prodForm.type === t ? TYPE_LABELS[t].bg + ' ' + TYPE_LABELS[t].color : 'bg-white/[0.02] border-white/[0.06] text-gray-500'
                                }`}
                            >
                                {TYPE_LABELS[t].label}
                            </button>
                        ))}
                    </div>
                </Field>
                {prodForm.type === 'product' && (
                    <Field label="Unidade de Medida">
                        <select value={prodForm.unit} onChange={e => setProdForm(f => ({ ...f, unit: e.target.value }))} className={selectCls}>
                            {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v} ({k})</option>)}
                        </select>
                        {prodForm.unit === 'custom' && (
                            <input value={prodForm.custom_unit} onChange={e => setProdForm(f => ({ ...f, custom_unit: e.target.value }))} className={inputCls + " mt-2"} placeholder="Nome da unidade personalizada" />
                        )}
                    </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Preço Unitário (R$)">
                        <input value={prodForm.unit_price} onChange={e => setProdForm(f => ({ ...f, unit_price: e.target.value }))} className={inputCls} placeholder="0,00" />
                    </Field>
                    <Field label="Custo (R$)">
                        <input value={prodForm.cost_price} onChange={e => setProdForm(f => ({ ...f, cost_price: e.target.value }))} className={inputCls} placeholder="0,00 (opcional)" />
                    </Field>
                </div>
                <Field label="Descrição">
                    <textarea value={prodForm.description} onChange={e => setProdForm(f => ({ ...f, description: e.target.value }))} className={inputCls + " min-h-[60px] resize-none"} placeholder="Descrição do item (opcional)..." />
                </Field>
                <button onClick={saveProd} disabled={saving || !prodForm.name || !prodForm.unit_price}
                    className="w-full backstagefy-btn-primary !py-3.5 !rounded-xl disabled:opacity-30 disabled:cursor-not-allowed">
                    {saving ? <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span> : (
                        <><span className="material-symbols-outlined text-lg">save</span>Salvar</>
                    )}
                </button>
            </Modal>

            {/* ═══════ AI SCANNER MODAL ═══════ */}
            <Modal open={scanModal} onClose={() => { setScanModal(false); setScanResult(null); setScanPreview(null); setScanError(null) }}
                title="🤖 Scanner IA de Documentos"
            >
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                />

                {!scanResult && !scanning && (
                    <>
                        {/* Drop zone */}
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
                                dragOver
                                    ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
                                    : 'border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.02]'
                            }`}
                        >
                            <div className="flex flex-col items-center gap-3">
                                <div className={`size-16 rounded-2xl flex items-center justify-center transition-all ${
                                    dragOver ? 'bg-cyan-500/20 scale-110' : 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10'
                                }`}>
                                    <span className="material-symbols-outlined text-3xl text-cyan-400" style={{ fontVariationSettings: "'FILL' 1" }}>document_scanner</span>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium mb-1">Arraste um documento aqui</p>
                                    <p className="text-gray-500 text-xs">ou clique para selecionar</p>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    {['Cupom Fiscal', 'Nota Fiscal', 'Contrato', 'Recibo', 'Boleto'].map(t => (
                                        <span key={t} className="text-[8px] text-gray-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full">{t}</span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                            <span className="material-symbols-outlined text-cyan-400 text-lg">auto_awesome</span>
                            <p className="text-gray-400 text-[11px] leading-relaxed">
                                A IA analisa o documento e classifica automaticamente como <span className="text-green-400 font-bold">receita</span> ou <span className="text-red-400 font-bold">despesa</span>, extraindo valor, data e fornecedor.
                            </p>
                        </div>
                    </>
                )}

                {/* Scanning state */}
                {scanning && (
                    <div className="text-center py-8 space-y-4">
                        {scanPreview && (
                            <div className="mx-auto w-32 h-32 rounded-xl overflow-hidden border border-white/10 mb-4">
                                <img src={scanPreview} alt="preview" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative">
                                <div className="size-12 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                                <span className="material-symbols-outlined text-cyan-400 text-lg absolute inset-0 flex items-center justify-center" style={{ fontVariationSettings: "'FILL' 1" }}>neurology</span>
                            </div>
                            <p className="text-white text-sm font-medium">Analisando documento...</p>
                            <p className="text-gray-500 text-[10px] uppercase tracking-widest">Gemini 2.0 Flash Vision</p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {scanError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-2">
                        <span className="material-symbols-outlined text-red-400 text-2xl">error</span>
                        <p className="text-red-400 text-sm">{scanError}</p>
                        <button onClick={() => { setScanError(null); setScanPreview(null) }}
                            className="text-white/60 text-xs underline hover:text-white transition-colors">Tentar novamente</button>
                    </div>
                )}

                {/* Result state */}
                {scanResult && (
                    <div className="space-y-4 animate-in fade-in duration-500">
                        <div className="flex items-center gap-3">
                            {scanPreview && (
                                <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-white/10">
                                    <img src={scanPreview} alt="doc" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                                        scanResult.type === 'income'
                                            ? 'text-green-400 bg-green-500/10 border-green-500/20'
                                            : 'text-red-400 bg-red-500/10 border-red-500/20'
                                    }`}>
                                        {scanResult.type === 'income' ? '↓ Receita' : '↑ Despesa'}
                                    </span>
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                                        scanResult.confidence >= 0.8
                                            ? 'text-green-400 bg-green-500/5 border-green-500/10'
                                            : scanResult.confidence >= 0.5
                                            ? 'text-amber-400 bg-amber-500/5 border-amber-500/10'
                                            : 'text-red-400 bg-red-500/5 border-red-500/10'
                                    }`}>
                                        {Math.round(scanResult.confidence * 100)}% confiança
                                    </span>
                                </div>
                                <p className="text-white text-sm font-medium truncate">{scanResult.description}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Valor</p>
                                <p className={`text-lg font-heading font-light ${scanResult.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                    {fmt(Number(scanResult.amount))}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Data</p>
                                <p className="text-lg font-heading font-light text-white">{fmtDate(scanResult.date)}</p>
                            </div>
                        </div>

                        {(scanResult.contact || scanResult.category_hint) && (
                            <div className="grid grid-cols-2 gap-3">
                                {scanResult.contact && (
                                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Fornecedor/Cliente</p>
                                        <p className="text-sm text-white truncate">{scanResult.contact}</p>
                                    </div>
                                )}
                                {scanResult.category_hint && (
                                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Categoria</p>
                                        <p className="text-sm text-cyan-400 truncate">{scanResult.category_hint}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                                <span className="material-symbols-outlined text-cyan-400 text-xs align-middle mr-1">auto_awesome</span>
                                {scanResult.summary}
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => { setScanResult(null); setScanPreview(null) }}
                                className="flex-1 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-400 text-sm font-bold hover:bg-white/[0.06] transition-all">
                                Escanear outro
                            </button>
                            <button onClick={applyScanResult}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-primary/20 border border-cyan-500/30 text-white text-sm font-bold hover:from-cyan-500/30 hover:to-primary/30 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10">
                                <span className="material-symbols-outlined text-lg">check_circle</span>
                                Aplicar e criar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
