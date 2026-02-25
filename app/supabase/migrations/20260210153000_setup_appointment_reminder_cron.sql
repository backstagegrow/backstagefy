-- Migration: Setup Cron Job for Appointment Reminders
-- Runs appointment-reminder Edge Function every 5 minutes

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Schedule the cron job (every 5 minutes)
SELECT cron.schedule(
  'appointment-reminder-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bleqjcxwtgzwbkediusr.supabase.co/functions/v1/appointment-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
