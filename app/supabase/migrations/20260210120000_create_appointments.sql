
-- Tabela de Agendamentos (Online e Presencial)
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    appointment_type VARCHAR(20) CHECK (appointment_type IN ('online', 'presencial')),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location_address TEXT,              -- Para presencial
    status VARCHAR(20) DEFAULT 'scheduled',
    
    -- Controle de Lembretes
    reminder_30min_sent BOOLEAN DEFAULT false,
    reminder_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Controle Online
    meeting_link TEXT,
    link_sent_at TIMESTAMP WITH TIME ZONE,
    notify_human BOOLEAN DEFAULT false, -- Flag para humano enviar link
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index para busca rápida por data (para o cron job de lembretes)
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
