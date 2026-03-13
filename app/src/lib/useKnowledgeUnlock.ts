import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useTenant } from '../context/TenantContext'

export type KBCategory = 'company_info' | 'products' | 'faq' | 'documents' | 'media'

interface CategoryStatus {
    id: KBCategory
    label: string
    icon: string
    filled: boolean
}

interface KnowledgeUnlockState {
    unlocked: boolean
    categories: CategoryStatus[]
    filledCount: number
    totalCount: number
    loading: boolean
}

const CATEGORY_META: { id: KBCategory; label: string; icon: string }[] = [
    { id: 'company_info', label: 'Dados Institucionais', icon: 'business' },
    { id: 'products', label: 'Produtos & Serviços', icon: 'inventory_2' },
    { id: 'faq', label: 'FAQ / SAC', icon: 'quiz' },
    { id: 'documents', label: 'Documentos', icon: 'description' },
    { id: 'media', label: 'Mídias', icon: 'perm_media' },
]

export function useKnowledgeUnlock(): KnowledgeUnlockState {
    const { tenant } = useTenant()
    const tenantId = tenant?.id
    const [filledCategories, setFilledCategories] = useState<Set<KBCategory>>(new Set())
    const [loading, setLoading] = useState(true)

    const checkCategories = useCallback(async () => {
        if (!supabase || !tenantId) return

        const { data } = await supabase
            .from('knowledge_documents')
            .select('category')
            .eq('tenant_id', tenantId)
            .eq('status', 'ready')

        const filled = new Set<KBCategory>()
        if (data) {
            for (const doc of data) {
                filled.add(doc.category as KBCategory)
            }
        }

        // company_info also counts if tenant.settings has ≥3 fields filled
        if (!filled.has('company_info') && tenant?.settings) {
            const s = tenant.settings as Record<string, string>
            const fieldsFilled = ['address', 'phone', 'hours', 'social', 'website', 'description']
                .filter(k => s[k]?.trim()).length
            if (fieldsFilled >= 3) filled.add('company_info')
        }

        setFilledCategories(filled)
        setLoading(false)
    }, [tenantId, tenant?.settings])

    useEffect(() => {
        checkCategories()
    }, [checkCategories])

    // Realtime subscription for instant unlock
    useEffect(() => {
        if (!supabase || !tenantId) return

        const channel = supabase
            .channel(`kb-unlock-${tenantId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: '*',
                    schema: 'public',
                    table: 'knowledge_documents',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                () => { checkCategories() }
            )
            .subscribe()

        return () => { supabase?.removeChannel(channel) }
    }, [tenantId, checkCategories])

    const categories: CategoryStatus[] = CATEGORY_META.map(c => ({
        ...c,
        filled: filledCategories.has(c.id),
    }))

    const filledCount = categories.filter(c => c.filled).length

    return {
        unlocked: filledCount === CATEGORY_META.length,
        categories,
        filledCount,
        totalCount: CATEGORY_META.length,
        loading,
    }
}
