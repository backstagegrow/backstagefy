-- Migration: 20260416_message_retry_queue
-- Cria tabela de fila de retry para mensagens que falharam no AI Concierge v7
-- Backoff: 30s → 2min → 5min (3 tentativas máximas)

CREATE TABLE IF NOT EXISTS message_retry_queue (
    id              UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       UUID            NOT NULL,
    payload         JSONB           NOT NULL,
    attempts        INT             DEFAULT 0,
    max_attempts    INT             DEFAULT 3,
    next_retry_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    last_error      TEXT,
    status          TEXT            DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at      TIMESTAMPTZ     DEFAULT now(),
    updated_at      TIMESTAMPTZ     DEFAULT now()
);

-- Index para o worker buscar mensagens pendentes eficientemente
CREATE INDEX IF NOT EXISTS idx_retry_queue_pending
    ON message_retry_queue (status, next_retry_at)
    WHERE status = 'pending';

-- Index por tenant para consultas de monitoramento
CREATE INDEX IF NOT EXISTS idx_retry_queue_tenant
    ON message_retry_queue (tenant_id, created_at DESC);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_retry_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_retry_queue_updated_at
    BEFORE UPDATE ON message_retry_queue
    FOR EACH ROW EXECUTE FUNCTION update_retry_queue_updated_at();

-- RLS: apenas service_role acessa (edge functions usam service key)
ALTER TABLE message_retry_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON message_retry_queue;
CREATE POLICY "service_role_only" ON message_retry_queue
    USING (auth.role() = 'service_role');
