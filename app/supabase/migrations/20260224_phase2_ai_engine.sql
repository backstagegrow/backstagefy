-- ================================================
-- PHASE 2: AI Engine Tables
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. WHATSAPP INSTANCES (per tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  instance_name TEXT NOT NULL,
  apikey TEXT NOT NULL,
  phone_number TEXT,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'banned')),
  qr_code TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, instance_name)
);

-- 2. FOLLOW UP LOGS
CREATE TABLE IF NOT EXISTS public.follow_up_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 10,
  last_attempt_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ADD current_funnel_step to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_funnel_step UUID REFERENCES public.funnel_steps(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new';

-- Add is_active column to funnel_steps
ALTER TABLE public.funnel_steps ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_tenant ON public.whatsapp_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_name ON public.whatsapp_instances(instance_name);
CREATE INDEX IF NOT EXISTS idx_follow_up_logs_lead ON public.follow_up_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_logs_tenant ON public.follow_up_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel_step ON public.leads(current_funnel_step);

-- 5. RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view instances" ON public.whatsapp_instances
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant admins can manage instances" ON public.whatsapp_instances
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Tenant members can view follow ups" ON public.follow_up_logs
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- 6. USAGE INCREMENT FUNCTION
CREATE OR REPLACE FUNCTION public.increment_usage(p_tenant_id UUID, p_field TEXT, p_amount INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.tenants
  SET usage = jsonb_set(
    usage,
    ARRAY[p_field],
    to_jsonb(COALESCE((usage->>p_field)::int, 0) + p_amount)
  ),
  updated_at = NOW()
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RAG VECTOR SEARCH FUNCTION
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_tenant_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.tenant_id = match_tenant_id
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
