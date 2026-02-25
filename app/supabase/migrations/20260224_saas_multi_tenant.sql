-- ================================================
-- BACKSTAGEFY SaaS Multi-Tenant Schema
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. TENANTS (Organizations/SaaS Clients)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  plan_status TEXT DEFAULT 'active' CHECK (plan_status IN ('active', 'trialing', 'past_due', 'cancelled')),
  plan_expires_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{"agents":1,"messages_month":1000,"rag_docs":50}',
  usage JSONB DEFAULT '{"messages_used":0,"rag_docs_used":0}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TENANT MEMBERS (Multi-user per tenant)
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- 3. AI AGENTS (Agent config per tenant)
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  system_prompt TEXT NOT NULL DEFAULT 'Você é um assistente de atendimento profissional.',
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature NUMERIC DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  is_active BOOLEAN DEFAULT true,
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'instagram', 'telegram', 'webchat')),
  whatsapp_instance TEXT,
  whatsapp_apikey TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FUNNEL STEPS (Structured funnel per agent)
CREATE TABLE IF NOT EXISTS public.funnel_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'qualification' CHECK (type IN ('greeting', 'qualification', 'offer', 'closing', 'sac', 'custom')),
  prompt_instructions TEXT,
  conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RAG KNOWLEDGE BASE
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT DEFAULT 'file' CHECK (source_type IN ('file', 'url', 'text', 'faq')),
  original_filename TEXT,
  storage_path TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CREATE CORE TABLES (Multi-tenant from the start)
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  agent_id UUID REFERENCES public.agents(id),
  phone TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'frio' CHECK (status IN ('frio', 'morno', 'quente')),
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  appointment_date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON public.agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_funnel_steps_agent ON public.funnel_steps(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant ON public.knowledge_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON public.knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant ON public.knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON public.leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_lead ON public.chat_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_tenant ON public.chat_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead ON public.appointments(lead_id);

-- 8. RLS POLICIES
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Tenants: only members can view their tenant
CREATE POLICY "Users can view their own tenants" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can update their tenant" ON public.tenants
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create tenants" ON public.tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Tenant Members: NO self-reference to avoid infinite recursion
CREATE POLICY "Users can see own memberships" ON public.tenant_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Tenant owners can insert members" ON public.tenant_members
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  );

CREATE POLICY "Tenant owners can update members" ON public.tenant_members
  FOR UPDATE USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  );

CREATE POLICY "Tenant owners can delete members" ON public.tenant_members
  FOR DELETE USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  );

-- Agents: tenant isolation
CREATE POLICY "Tenant members can view agents" ON public.agents
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant admins can manage agents" ON public.agents
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Funnel Steps: tenant isolation
CREATE POLICY "Tenant members can view funnel steps" ON public.funnel_steps
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant admins can manage funnel steps" ON public.funnel_steps
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Knowledge Docs: tenant isolation
CREATE POLICY "Tenant members can view knowledge docs" ON public.knowledge_documents
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant admins can manage knowledge docs" ON public.knowledge_documents
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Knowledge Chunks: tenant isolation
CREATE POLICY "Tenant members can view knowledge chunks" ON public.knowledge_chunks
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );
