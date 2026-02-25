
-- 1. Garantir que a tabela de leads tem todos os campos necessários
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS budget_range TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS corporate_email TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_name TEXT;

-- 2. Corrigir a tabela de agendamentos (Unificar com a lógica da IA)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appointment_type TEXT DEFAULT 'presencial';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS location_address TEXT;

-- Migrar dados antigos se existirem (com check de segurança)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='appointment_date') THEN
        EXECUTE 'UPDATE public.appointments SET scheduled_at = appointment_date WHERE scheduled_at IS NULL AND appointment_date IS NOT NULL';
    END IF;
END $$;

-- 3. Garantir fuso horário de Brasília
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';
