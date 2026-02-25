import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface Tenant {
    id: string;
    name: string;
    slug: string;
    plan: string;
    plan_status: string;
    limits: { agents: number; messages_month: number; rag_docs: number };
    usage: { messages_used: number; rag_docs_used: number };
    settings: Record<string, any>;
}

interface TenantContextType {
    tenant: Tenant | null;
    tenantId: string | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
    tenant: null,
    tenantId: null,
    loading: true,
    error: null,
    refetch: async () => { },
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTenant = async () => {
        try {
            if (!supabase) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const { data: membership, error: memErr } = await supabase
                .from('tenant_members')
                .select('tenant_id, role')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

            if (memErr || !membership) {
                setTenant(null);
                setLoading(false);
                return;
            }

            const { data: tenantData, error: tenErr } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', membership.tenant_id)
                .single();

            if (tenErr) { setError(tenErr.message); setLoading(false); return; }

            setTenant(tenantData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTenant(); }, []);

    return (
        <TenantContext.Provider value={{ tenant, tenantId: tenant?.id ?? null, loading, error, refetch: fetchTenant }}>
            {children}
        </TenantContext.Provider>
    );
};

export default TenantContext;
