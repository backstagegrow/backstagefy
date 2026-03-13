-- ═══════════════════════════════════════════════════════
-- SALES DASHBOARD — Platform Connections + Sales + Events
-- ═══════════════════════════════════════════════════════

-- 1. Platform Connections (credentials per tenant/platform)
CREATE TABLE IF NOT EXISTS platform_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('hotmart', 'kiwify', 'sympla', 'blinket', 'eventin')),
    credentials jsonb NOT NULL DEFAULT '{}',
    scopes text[] DEFAULT '{}',
    connected_at timestamptz DEFAULT now(),
    last_sync_at timestamptz,
    sync_status text DEFAULT 'pending' CHECK (sync_status IN ('ok', 'error', 'syncing', 'pending')),
    sync_error text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, platform)
);

-- 2. Events/Products (metadata for each event or product being sold)
CREATE TABLE IF NOT EXISTS sales_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    platform text NOT NULL,
    platform_event_id text,
    name text NOT NULL,
    description text,
    event_date timestamptz,
    event_end_date timestamptz,
    location text,
    capacity integer,
    event_type text DEFAULT 'product' CHECK (event_type IN ('event', 'course', 'product', 'subscription', 'other')),
    image_url text,
    is_active boolean DEFAULT true,
    raw_payload jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, platform, platform_event_id)
);

-- 3. Sales (normalized sales from all platforms)
CREATE TABLE IF NOT EXISTS platform_sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_id uuid REFERENCES sales_events(id) ON DELETE SET NULL,
    platform text NOT NULL,
    order_id text NOT NULL,
    status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'refunded', 'chargeback', 'abandoned', 'pending', 'cancelled', 'expired')),
    payment_method text,
    amount numeric(12,2) NOT NULL DEFAULT 0,
    currency text DEFAULT 'BRL',
    buyer_name text,
    buyer_email text,
    buyer_phone text,
    ticket_type text,
    checkin_done boolean DEFAULT false,
    checkin_at timestamptz,
    offer_name text,
    is_order_bump boolean DEFAULT false,
    raw_payload jsonb,
    sold_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    synced_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, platform, order_id)
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pc_tenant ON platform_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_se_tenant ON sales_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_se_platform ON sales_events(tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_ps_tenant ON platform_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ps_status ON platform_sales(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ps_platform ON platform_sales(tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_ps_sold_at ON platform_sales(tenant_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_event ON platform_sales(event_id);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sales ENABLE ROW LEVEL SECURITY;

-- Platform Connections
CREATE POLICY "pc_tenant_select" ON platform_connections FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "pc_tenant_insert" ON platform_connections FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "pc_tenant_update" ON platform_connections FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "pc_tenant_delete" ON platform_connections FOR DELETE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "pc_service" ON platform_connections FOR ALL
    USING (auth.role() = 'service_role');

-- Sales Events
CREATE POLICY "se_tenant_select" ON sales_events FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "se_tenant_insert" ON sales_events FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "se_tenant_update" ON sales_events FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "se_service" ON sales_events FOR ALL
    USING (auth.role() = 'service_role');

-- Platform Sales
CREATE POLICY "ps_tenant_select" ON platform_sales FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ps_tenant_insert" ON platform_sales FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ps_tenant_update" ON platform_sales FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ps_service" ON platform_sales FOR ALL
    USING (auth.role() = 'service_role');
