-- Migration: create_google_calendar_tokens
-- Execute no Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expiry_date bigint,
  google_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can manage own calendar tokens"
  ON google_calendar_tokens
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE user_id = auth.uid()
    )
  );

-- Adiciona coluna google_event_id na tabela appointments (se não existir)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_event_id text;
