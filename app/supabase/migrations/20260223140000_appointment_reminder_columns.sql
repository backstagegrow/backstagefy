-- Add missing reminder tracking columns to appointments table
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS reminder_24h_sent TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS post_meeting_sent TIMESTAMPTZ;

-- Ensure reminder_30min_sent column is boolean (may already exist as text)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appointments' AND column_name = 'reminder_30min_sent'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN reminder_30min_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
