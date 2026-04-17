-- Migration: 20260416_retry_worker_cron
-- Configura pg_cron para disparar o retry-worker a cada minuto
--
-- PRÉ-REQUISITO (faça ANTES de rodar este SQL):
--   Supabase Dashboard → Database → Extensions → habilitar pg_cron e pg_net
--   NÃO habilite via SQL — o Supabase gerenciado exige ativação via UI.
--
-- Substitua YOUR_PROJECT_REF pelo ref do projeto (ex: abcdefghijklmnop)
-- Substitua YOUR_SERVICE_ROLE_KEY pela service_role key do projeto

-- Remove job existente (safe — só age se existir)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'retry-worker-job';

-- Agenda o retry-worker a cada 1 minuto
SELECT cron.schedule(
    'retry-worker-job',
    '* * * * *',
    $$
    SELECT net.http_post(
        url     := 'https://xaivgzrmxewkevlqvphi.supabase.co/functions/v1/retry-worker',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhaXZnenJteGV3a2V2bHF2cGhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk2Mjc2NiwiZXhwIjoyMDg3NTM4NzY2fQ.2ZniGbPyAR2y1gBmDfMwU3wqQvuykKPxKwZjJdj7nI4"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
);

-- Função auxiliar: calcula próximo next_retry_at com backoff exponencial
-- Uso: UPDATE message_retry_queue SET next_retry_at = calc_next_retry(attempts)
CREATE OR REPLACE FUNCTION calc_next_retry(attempt_count INT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN now() + CASE attempt_count
        WHEN 0 THEN INTERVAL '30 seconds'
        WHEN 1 THEN INTERVAL '2 minutes'
        ELSE          INTERVAL '5 minutes'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calc_next_retry IS
    'Backoff: 30s (attempt 0) → 2min (attempt 1) → 5min (attempt 2+)';
