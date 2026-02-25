-- AI Agent Suite Core Schema
-- Project: bleqjcxwtgzwbkediusr

-- 1. Leads Table (with AI qualification support)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    company_name TEXT,
    corporate_email TEXT,
    budget_range TEXT CHECK (budget_range IN ('A', 'B', 'C', 'D')),
    event_format TEXT,
    status TEXT DEFAULT 'frio' CHECK (status IN ('frio', 'morno', 'quente')),
    pipeline_stage TEXT DEFAULT 'new',
    metadata JSONB DEFAULT '{}'::jsonb,
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Chat History (Audit and AI Context)
CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Appointments (AI Scheduling)
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    notes TEXT,
    ai_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Gallery Images (AI Tool: send_gallery)
CREATE TABLE IF NOT EXISTS public.gallery_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'space' CHECK (category IN ('space', 'acer', 'gastronomy', 'tech')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. RLS Policies
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Public Policies (minimal)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Full Access' AND tablename = 'leads') THEN
        CREATE POLICY "Authenticated Full Access" ON public.leads FOR ALL USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Full Access' AND tablename = 'chat_history') THEN
        CREATE POLICY "Authenticated Full Access" ON public.chat_history FOR ALL USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Full Access' AND tablename = 'appointments') THEN
        CREATE POLICY "Authenticated Full Access" ON public.appointments FOR ALL USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Full Access' AND tablename = 'gallery_images') THEN
        CREATE POLICY "Authenticated Full Access" ON public.gallery_images FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
