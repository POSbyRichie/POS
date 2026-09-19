-- ====================================================================
-- ANTIGRAVITY ENTERPRISE OFFLINE-FIRST POS: POSTGRESQL SCHEMA (SUPABASE)
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STORES & REGISTERS
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    currency_code TEXT NOT NULL DEFAULT 'UGX',
    currency_symbol TEXT NOT NULL DEFAULT 'UGX',
    currency_decimals INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.registers (
    id TEXT PRIMARY KEY, -- e.g. 'reg-001-main'
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    register_name TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'Main Branch',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USER PROFILES & RBAC
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'cashier', 'inventory_manager');

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'cashier',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PRODUCT CATEGORIES & PRODUCTS
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    cost_price BIGINT NOT NULL DEFAULT 0, -- Minor units / integer
    selling_price BIGINT NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL DEFAULT 'pcs',
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 5,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- 4. INVENTORY MOVEMENTS (EVENT SOURCED LEDGER)
CREATE TYPE public.inventory_movement_type AS ENUM ('SALE', 'RESTOCK', 'DAMAGE', 'RETURN', 'ADJUSTMENT');

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    register_id TEXT NOT NULL REFERENCES public.registers(id) ON DELETE RESTRICT,
    shift_id UUID,
    type public.inventory_movement_type NOT NULL,
    quantity_delta INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reference_id TEXT,
    user_id UUID,
    notes TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_key ON public.inventory_movements(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod ON public.inventory_movements(product_id);

-- 5. SHIFTS
CREATE TYPE public.shift_status AS ENUM ('open', 'closed');

CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    register_id TEXT NOT NULL REFERENCES public.registers(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL,
    status public.shift_status NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_float BIGINT NOT NULL DEFAULT 0,
    closing_cash_actual BIGINT,
    closing_cash_expected BIGINT,
    variance BIGINT,
    total_sales BIGINT NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    cash_sales_total BIGINT NOT NULL DEFAULT 0,
    card_sales_total BIGINT NOT NULL DEFAULT 0,
    wallet_sales_total BIGINT NOT NULL DEFAULT 0,
    qr_sales_total BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_key ON public.shifts(idempotency_key);

-- 6. CUSTOMERS & LOYALTY
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    loyalty_number TEXT UNIQUE,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    sale_id UUID,
    points_delta INTEGER NOT NULL,
    previous_points INTEGER NOT NULL,
    new_points INTEGER NOT NULL,
    type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. SALES, SALE ITEMS & PAYMENTS
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    receipt_number TEXT NOT NULL UNIQUE,
    shift_id UUID,
    register_id TEXT NOT NULL REFERENCES public.registers(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    subtotal BIGINT NOT NULL DEFAULT 0,
    discount_amount BIGINT NOT NULL DEFAULT 0,
    tax_amount BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    amount_paid BIGINT NOT NULL DEFAULT 0,
    change_amount BIGINT NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'paid',
    items_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_idempotency ON public.sales(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON public.sales(receipt_number);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price BIGINT NOT NULL DEFAULT 0,
    discount_amount BIGINT NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_price BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount_paid BIGINT NOT NULL DEFAULT 0,
    change_given BIGINT NOT NULL DEFAULT 0,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'successful',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. RECEIPTS & SYNC AUDIT LOG
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    receipt_number TEXT NOT NULL,
    content_json JSONB NOT NULL,
    printed_at TIMESTAMPTZ,
    email_queued BOOLEAN NOT NULL DEFAULT FALSE,
    sms_queued BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    idempotency_key TEXT,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

-- Product and category read policies for authenticated users
CREATE POLICY "Allow authenticated read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read registers" ON public.registers FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read customers" ON public.customers FOR SELECT USING (true);

-- Insert policies for cashiers & sync service
CREATE POLICY "Allow insert sales" ON public.sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "Allow insert sale items" ON public.sale_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select sale items" ON public.sale_items FOR SELECT USING (true);
CREATE POLICY "Allow insert payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Allow insert inventory movements" ON public.inventory_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow insert shifts" ON public.shifts FOR ALL USING (true);
CREATE POLICY "Allow insert customers" ON public.customers FOR ALL USING (true);
CREATE POLICY "Allow insert loyalty transactions" ON public.loyalty_transactions FOR ALL USING (true);
CREATE POLICY "Allow receipts" ON public.receipts FOR ALL USING (true);
CREATE POLICY "Allow audit log" ON public.sync_audit_log FOR ALL USING (true);

-- ====================================================================
-- IDEMPOTENT SALE INGESTION RPC FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION public.rpc_sync_offline_sale(
    p_sale JSONB,
    p_items JSONB,
    p_payments JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_sale UUID;
    v_sale_id UUID;
    v_item JSONB;
    v_payment JSONB;
BEGIN
    -- 1. Check idempotency key to guarantee zero duplicate sales
    SELECT id INTO v_existing_sale 
    FROM public.sales 
    WHERE idempotency_key = (p_sale->>'idempotency_key');

    IF v_existing_sale IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'already_exists',
            'sale_id', v_existing_sale,
            'message', 'Sale was already synchronized previously'
        );
    END IF;

    -- 2. Insert Sale
    INSERT INTO public.sales (
        id,
        idempotency_key,
        receipt_number,
        shift_id,
        register_id,
        cashier_id,
        customer_id,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        amount_paid,
        change_amount,
        payment_method,
        payment_status,
        items_count,
        notes,
        created_at
    ) VALUES (
        (p_sale->>'id')::UUID,
        p_sale->>'idempotency_key',
        p_sale->>'receipt_number',
        (p_sale->>'shift_id')::UUID,
        p_sale->>'register_id',
        (p_sale->>'cashier_id')::UUID,
        (p_sale->>'customer_id')::UUID,
        (p_sale->>'subtotal')::BIGINT,
        (p_sale->>'discount_amount')::BIGINT,
        (p_sale->>'tax_amount')::BIGINT,
        (p_sale->>'total_amount')::BIGINT,
        (p_sale->>'amount_paid')::BIGINT,
        (p_sale->>'change_amount')::BIGINT,
        p_sale->>'payment_method',
        p_sale->>'payment_status',
        (p_sale->>'items_count')::INTEGER,
        p_sale->>'notes',
        (p_sale->>'created_at')::TIMESTAMPTZ
    ) RETURNING id INTO v_sale_id;

    -- 3. Insert Sale Items and update inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (
            id,
            sale_id,
            product_id,
            sku,
            product_name,
            quantity,
            unit_price,
            discount_amount,
            tax_rate,
            total_price
        ) VALUES (
            (v_item->>'id')::UUID,
            v_sale_id,
            (v_item->>'product_id')::UUID,
            v_item->>'sku',
            v_item->>'product_name',
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::BIGINT,
            (v_item->>'discount_amount')::BIGINT,
            (v_item->>'tax_rate')::NUMERIC,
            (v_item->>'total_price')::BIGINT
        );

        -- Decrement product stock on server
        UPDATE public.products
        SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
            updated_at = NOW()
        WHERE id = (v_item->>'product_id')::UUID;
    END LOOP;

    -- 4. Insert Payments
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        INSERT INTO public.payments (
            id,
            idempotency_key,
            sale_id,
            method,
            amount_paid,
            change_given,
            reference,
            status,
            timestamp
        ) VALUES (
            (v_payment->>'id')::UUID,
            v_payment->>'idempotency_key',
            v_sale_id,
            v_payment->>'method',
            (v_payment->>'amount_paid')::BIGINT,
            (v_payment->>'change_given')::BIGINT,
            v_payment->>'reference',
            v_payment->>'status',
            (v_payment->>'timestamp')::TIMESTAMPTZ
        );
    END LOOP;

    -- 5. Audit Log
    INSERT INTO public.sync_audit_log (
        user_id,
        action,
        entity_type,
        entity_id,
        idempotency_key,
        details
    ) VALUES (
        p_sale->>'cashier_id',
        'SYNC_SALE',
        'sale',
        v_sale_id::TEXT,
        p_sale->>'idempotency_key',
        'Ingested via rpc_sync_offline_sale'
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'sale_id', v_sale_id
    );
END;
$$;
