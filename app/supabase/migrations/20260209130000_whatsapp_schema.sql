-- Migration: Create WhatsApp Instances and Logs Tables
-- Project: bleqjcxwtgzwbkediusr (spHAUS)

-- 1. Create logs table for debugging if it doesn't exist
CREATE TABLE IF NOT EXISTS public.logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    service TEXT NOT NULL
);

-- 2. Create whatsapp_instances table
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    friendly_name TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    apikey TEXT,
    phone_number TEXT,
    profile_pic_url TEXT,
    profile_name TEXT,
    purpose TEXT DEFAULT 'atendimento',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, instance_name)
);

-- 3. Enable RLS
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Allow authenticated users to manage their own instances)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own logs') THEN
        CREATE POLICY "Users can view their own logs" ON public.logs FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own instances') THEN
        CREATE POLICY "Users can manage their own instances" ON public.whatsapp_instances 
        FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
