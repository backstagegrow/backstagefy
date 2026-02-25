-- Migration: Shared WhatsApp Instance (Multi-User Support)
-- All authenticated users can see and manage the same WhatsApp instance

-- 1. Drop existing per-user policy
DROP POLICY IF EXISTS "Users can manage their own instances" ON public.whatsapp_instances;

-- 2. Create shared access policy (all authenticated users see all instances)
CREATE POLICY "Authenticated users can view all instances"
ON public.whatsapp_instances
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage instances"
ON public.whatsapp_instances
FOR ALL
USING (auth.role() = 'authenticated');

-- 3. Ensure app_config table exists and is accessible
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Full Access' AND tablename = 'app_config') THEN
        CREATE POLICY "Authenticated Full Access" ON public.app_config FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
