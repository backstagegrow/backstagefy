-- ═══════════════════════════════════════════════════════
-- FINANCIAL MODULE — Categories, Products, Transactions
-- BackStageFy Platform
-- ═══════════════════════════════════════════════════════

-- 1. Financial Categories (typed: income, expense, or both)
CREATE TABLE IF NOT EXISTS fin_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'both' CHECK (type IN ('income', 'expense', 'both')),
    icon text DEFAULT 'category',
    color text DEFAULT '#22c55e',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- 2. Products & Services Catalog
CREATE TABLE IF NOT EXISTS fin_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    type text NOT NULL DEFAULT 'product' CHECK (type IN ('product', 'service', 'fee')),
    unit text DEFAULT 'un' CHECK (unit IN ('un', 'm', 'm2', 'kg', 'hr', 'pct', 'rolo', 'pc', 'cx', 'l', 'custom')),
    custom_unit text,
    unit_price numeric(12,2) NOT NULL DEFAULT 0,
    cost_price numeric(12,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Financial Transactions (payable & receivable)
CREATE TABLE IF NOT EXISTS fin_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('income', 'expense')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    description text NOT NULL,
    amount numeric(12,2) NOT NULL DEFAULT 0,
    due_date date NOT NULL,
    paid_date date,
    category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
    contact_name text,
    contact_email text,
    contact_phone text,
    notes text,
    attachment_url text,
    recurrence text DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly', 'weekly', 'yearly')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Transaction Items (line items linked to products)
CREATE TABLE IF NOT EXISTS fin_transaction_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES fin_transactions(id) ON DELETE CASCADE,
    product_id uuid REFERENCES fin_products(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity numeric(10,3) NOT NULL DEFAULT 1,
    unit_price numeric(12,2) NOT NULL DEFAULT 0,
    total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at timestamptz DEFAULT now()
);

-- 5. Company Financial Info (for quotes/invoices)
CREATE TABLE IF NOT EXISTS fin_company_info (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_name text,
    cnpj text,
    address text,
    city text,
    state text,
    zip_code text,
    phone text,
    email text,
    logo_url text,
    bank_name text,
    bank_agency text,
    bank_account text,
    pix_key text,
    footer_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id)
);

-- 6. Quotes/Proposals (Phase C — table created now, filled later)
CREATE TABLE IF NOT EXISTS fin_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_number serial,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired')),
    client_name text NOT NULL,
    client_email text,
    client_phone text,
    client_cnpj text,
    client_address text,
    subtotal numeric(12,2) DEFAULT 0,
    discount numeric(12,2) DEFAULT 0,
    total numeric(12,2) DEFAULT 0,
    valid_until date,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_fc_tenant ON fin_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fp_tenant ON fin_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fp_type ON fin_products(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_ft_tenant ON fin_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ft_type ON fin_transactions(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_ft_status ON fin_transactions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ft_due ON fin_transactions(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_fti_tx ON fin_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fci_tenant ON fin_company_info(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fq_tenant ON fin_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fq_status ON fin_quotes(tenant_id, status);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════
ALTER TABLE fin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_company_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_quotes ENABLE ROW LEVEL SECURITY;

-- fin_categories
CREATE POLICY "fc_select" ON fin_categories FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fc_insert" ON fin_categories FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fc_update" ON fin_categories FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fc_delete" ON fin_categories FOR DELETE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));

-- fin_products
CREATE POLICY "fp_select" ON fin_products FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fp_insert" ON fin_products FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fp_update" ON fin_products FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fp_delete" ON fin_products FOR DELETE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));

-- fin_transactions
CREATE POLICY "ft_select" ON fin_transactions FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ft_insert" ON fin_transactions FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ft_update" ON fin_transactions FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "ft_delete" ON fin_transactions FOR DELETE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));

-- fin_transaction_items (access via transaction's tenant)
CREATE POLICY "fti_select" ON fin_transaction_items FOR SELECT
    USING (transaction_id IN (
        SELECT id FROM fin_transactions WHERE tenant_id IN (
            SELECT id FROM tenants WHERE owner_id = auth.uid()
        )
    ));
CREATE POLICY "fti_insert" ON fin_transaction_items FOR INSERT
    WITH CHECK (transaction_id IN (
        SELECT id FROM fin_transactions WHERE tenant_id IN (
            SELECT id FROM tenants WHERE owner_id = auth.uid()
        )
    ));
CREATE POLICY "fti_update" ON fin_transaction_items FOR UPDATE
    USING (transaction_id IN (
        SELECT id FROM fin_transactions WHERE tenant_id IN (
            SELECT id FROM tenants WHERE owner_id = auth.uid()
        )
    ));
CREATE POLICY "fti_delete" ON fin_transaction_items FOR DELETE
    USING (transaction_id IN (
        SELECT id FROM fin_transactions WHERE tenant_id IN (
            SELECT id FROM tenants WHERE owner_id = auth.uid()
        )
    ));

-- fin_company_info
CREATE POLICY "fci_select" ON fin_company_info FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fci_insert" ON fin_company_info FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fci_update" ON fin_company_info FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));

-- fin_quotes
CREATE POLICY "fq_select" ON fin_quotes FOR SELECT
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fq_insert" ON fin_quotes FOR INSERT
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fq_update" ON fin_quotes FOR UPDATE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));
CREATE POLICY "fq_delete" ON fin_quotes FOR DELETE
    USING (tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid()));

-- ═══════════════════════════════════════════════════════
-- SEED DEFAULT CATEGORIES (per-tenant, run after tenant exists)
-- Use this as a helper function to seed categories for new tenants
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION seed_fin_categories(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
    INSERT INTO fin_categories (tenant_id, name, type, icon, color) VALUES
        (p_tenant_id, 'Material', 'expense', 'inventory_2', '#F59E0B'),
        (p_tenant_id, 'Serviço Terceirizado', 'expense', 'engineering', '#8B5CF6'),
        (p_tenant_id, 'Aluguel', 'expense', 'home', '#EF4444'),
        (p_tenant_id, 'Logística', 'expense', 'local_shipping', '#F97316'),
        (p_tenant_id, 'Pessoal', 'expense', 'groups', '#EC4899'),
        (p_tenant_id, 'Impostos', 'expense', 'receipt_long', '#6B7280'),
        (p_tenant_id, 'Venda de Produto', 'income', 'store', '#22C55E'),
        (p_tenant_id, 'Prestação de Serviço', 'income', 'handshake', '#3B82F6'),
        (p_tenant_id, 'Consultoria', 'income', 'psychology', '#14B8A6'),
        (p_tenant_id, 'Locação', 'income', 'apartment', '#A855F7')
    ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
