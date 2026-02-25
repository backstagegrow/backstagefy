
-- Tabela para log de follow-ups automáticos
CREATE TABLE IF NOT EXISTS public.follow_up_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    logs JSONB DEFAULT '[]'::jsonb, -- Histórico de mensagens enviadas pelo follow-up
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para performance na busca por inatividade
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_lookup 
ON public.leads(budget_range, last_interaction) 
WHERE budget_range IN ('A', 'B', 'C');

-- Habilitar extensões necessárias se não estiverem
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar o Follow-up para rodar a cada 10 minutos
-- Substituir 'YOUR_PROJECT_REF' e 'YOUR_SERVICE_ROLE_KEY' se necessário via terminal ou manter placeholder
-- Nota: Em migrações Supabase, o ideal é usar net.http_post para a URL da function
SELECT cron.schedule(
  'smart-follow-up-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bleqjcxwtgzwbkediusr.supabase.co/functions/v1/smart-followup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
