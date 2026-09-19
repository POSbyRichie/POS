-- Migration 20260919000003_rpc_atomic_sync.sql
-- Description: Server-Side Atomic RPC Functions for Offline POS Sync and Shift Reconciliation

-- ============================================================================
-- 1. Atomic POS Sale Ingestion RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION ingest_pos_sale(
  p_sale JSONB,
  p_items JSONB,
  p_payment JSONB,
  p_payment_items JSONB,
  p_receipt JSONB,
  p_movements JSONB,
  p_loyalty_tx JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_existing_sale_id UUID;
  v_payment_id UUID;
  v_item RECORD;
  v_pitem RECORD;
  v_movement RECORD;
  v_customer_id UUID;
  v_points_delta BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- 1. Check idempotency for sale
  SELECT id INTO v_existing_sale_id
  FROM sales
  WHERE idempotency_key = (p_sale->>'idempotency_key');

  IF v_existing_sale_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_processed',
      'sale_id', v_existing_sale_id,
      'receipt_number', p_sale->>'receipt_number'
    );
  END IF;

  -- 2. Insert Sale Header
  INSERT INTO sales (
    id,
    idempotency_key,
    receipt_number,
    store_id,
    register_id,
    shift_id,
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
    COALESCE((p_sale->>'id')::UUID, gen_random_uuid()),
    p_sale->>'idempotency_key',
    p_sale->>'receipt_number',
    (p_sale->>'store_id')::UUID,
    (p_sale->>'register_id')::UUID,
    (p_sale->>'shift_id')::UUID,
    (p_sale->>'cashier_id')::UUID,
    (p_sale->>'customer_id')::UUID,
    (p_sale->>'subtotal')::BIGINT,
    COALESCE((p_sale->>'discount_amount')::BIGINT, 0),
    COALESCE((p_sale->>'tax_amount')::BIGINT, 0),
    (p_sale->>'total_amount')::BIGINT,
    (p_sale->>'amount_paid')::BIGINT,
    COALESCE((p_sale->>'change_amount')::BIGINT, 0),
    p_sale->>'payment_method',
    COALESCE(p_sale->>'payment_status', 'paid'),
    COALESCE((p_sale->>'items_count')::INT, 1),
    COALESCE(p_sale->>'notes', ''),
    COALESCE((p_sale->>'created_at')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_sale_id;

  -- 3. Insert Sale Items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    id UUID,
    product_id UUID,
    sku TEXT,
    product_name TEXT,
    quantity NUMERIC(12, 3),
    unit_price BIGINT,
    discount_amount BIGINT,
    tax_rate NUMERIC(5, 2),
    total_price BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ
  ) LOOP
    INSERT INTO sale_items (
      id,
      sale_id,
      product_id,
      sku,
      product_name,
      quantity,
      unit_price,
      discount_amount,
      tax_rate,
      total_price,
      notes,
      created_at
    ) VALUES (
      COALESCE(v_item.id, gen_random_uuid()),
      v_sale_id,
      v_item.product_id,
      v_item.sku,
      v_item.product_name,
      v_item.quantity,
      v_item.unit_price,
      COALESCE(v_item.discount_amount, 0),
      COALESCE(v_item.tax_rate, 0),
      v_item.total_price,
      COALESCE(v_item.notes, ''),
      COALESCE(v_item.created_at, NOW())
    );
  END LOOP;

  -- 4. Insert Payment Master
  INSERT INTO payments (
    id,
    idempotency_key,
    sale_id,
    payment_method,
    amount,
    currency,
    status,
    created_at
  ) VALUES (
    COALESCE((p_payment->>'id')::UUID, gen_random_uuid()),
    p_payment->>'idempotency_key',
    v_sale_id,
    p_payment->>'payment_method',
    (p_payment->>'amount')::BIGINT,
    COALESCE(p_payment->>'currency', 'UGX'),
    COALESCE(p_payment->>'status', 'successful'),
    COALESCE((p_payment->>'created_at')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_payment_id;

  -- 5. Insert Payment Items (Split breakdown)
  IF p_payment_items IS NOT NULL AND jsonb_array_length(p_payment_items) > 0 THEN
    FOR v_pitem IN SELECT * FROM jsonb_to_recordset(p_payment_items) AS y(
      id UUID,
      method TEXT,
      amount_paid BIGINT,
      change_given BIGINT,
      reference TEXT,
      provider_response JSONB,
      created_at TIMESTAMPTZ
    ) LOOP
      INSERT INTO payment_items (
        id,
        payment_id,
        method,
        amount_paid,
        change_given,
        reference,
        provider_response,
        created_at
      ) VALUES (
        COALESCE(v_pitem.id, gen_random_uuid()),
        v_payment_id,
        v_pitem.method,
        v_pitem.amount_paid,
        COALESCE(v_pitem.change_given, 0),
        COALESCE(v_pitem.reference, ''),
        COALESCE(v_pitem.provider_response, '{}'::jsonb),
        COALESCE(v_pitem.created_at, NOW())
      );
    END LOOP;
  END IF;

  -- 6. Insert Receipt Record
  IF p_receipt IS NOT NULL THEN
    INSERT INTO receipts (
      id,
      sale_id,
      receipt_number,
      content_json,
      printed_at,
      email_queued,
      sms_queued,
      email_recipient,
      sms_recipient,
      created_at
    ) VALUES (
      COALESCE((p_receipt->>'id')::UUID, gen_random_uuid()),
      v_sale_id,
      p_sale->>'receipt_number',
      p_receipt->'content_json',
      (p_receipt->>'printed_at')::TIMESTAMPTZ,
      COALESCE((p_receipt->>'email_queued')::BOOLEAN, FALSE),
      COALESCE((p_receipt->>'sms_queued')::BOOLEAN, FALSE),
      p_receipt->>'email_recipient',
      p_receipt->>'sms_recipient',
      COALESCE((p_receipt->>'created_at')::TIMESTAMPTZ, NOW())
    );
  END IF;

  -- 7. Record Inventory Movements & Trigger Inventory Update
  IF p_movements IS NOT NULL AND jsonb_array_length(p_movements) > 0 THEN
    FOR v_movement IN SELECT * FROM jsonb_to_recordset(p_movements) AS m(
      id UUID,
      idempotency_key TEXT,
      store_id UUID,
      product_id UUID,
      register_id UUID,
      shift_id UUID,
      type TEXT,
      quantity_delta NUMERIC(12, 3),
      previous_quantity NUMERIC(12, 3),
      new_quantity NUMERIC(12, 3),
      reference_id TEXT,
      user_id UUID,
      notes TEXT,
      created_at TIMESTAMPTZ
    ) LOOP
      INSERT INTO inventory_movements (
        id,
        idempotency_key,
        store_id,
        product_id,
        register_id,
        shift_id,
        type,
        quantity_delta,
        previous_quantity,
        new_quantity,
        reference_id,
        user_id,
        notes,
        created_at
      ) VALUES (
        COALESCE(v_movement.id, gen_random_uuid()),
        v_movement.idempotency_key,
        v_movement.store_id,
        v_movement.product_id,
        v_movement.register_id,
        v_movement.shift_id,
        v_movement.type,
        v_movement.quantity_delta,
        v_movement.previous_quantity,
        v_movement.new_quantity,
        COALESCE(v_movement.reference_id, v_sale_id::TEXT),
        v_movement.user_id,
        COALESCE(v_movement.notes, ''),
        COALESCE(v_movement.created_at, NOW())
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  -- 8. Record Loyalty Transaction if applicable
  IF p_loyalty_tx IS NOT NULL THEN
    v_customer_id := (p_loyalty_tx->>'customer_id')::UUID;
    v_points_delta := (p_loyalty_tx->>'points_delta')::BIGINT;

    -- Update or create loyalty account
    INSERT INTO loyalty_accounts (customer_id, points_balance, lifetime_points_earned, tier)
    VALUES (v_customer_id, GREATEST(0, v_points_delta), GREATEST(0, v_points_delta), 'standard')
    ON CONFLICT (customer_id)
    DO UPDATE SET
      points_balance = GREATEST(0, loyalty_accounts.points_balance + v_points_delta),
      lifetime_points_earned = loyalty_accounts.lifetime_points_earned + CASE WHEN v_points_delta > 0 THEN v_points_delta ELSE 0 END,
      lifetime_points_redeemed = loyalty_accounts.lifetime_points_redeemed + CASE WHEN v_points_delta < 0 THEN ABS(v_points_delta) ELSE 0 END,
      updated_at = NOW()
    RETURNING points_balance INTO v_new_balance;

    -- Insert immutable transaction log
    INSERT INTO loyalty_transactions (
      id,
      idempotency_key,
      customer_id,
      sale_id,
      type,
      points_delta,
      previous_points,
      new_points,
      notes,
      created_at
    ) VALUES (
      COALESCE((p_loyalty_tx->>'id')::UUID, gen_random_uuid()),
      p_loyalty_tx->>'idempotency_key',
      v_customer_id,
      v_sale_id,
      p_loyalty_tx->>'type',
      v_points_delta,
      COALESCE((p_loyalty_tx->>'previous_points')::BIGINT, 0),
      v_new_balance,
      COALESCE(p_loyalty_tx->>'notes', ''),
      COALESCE((p_loyalty_tx->>'created_at')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- 9. Update Shift running totals
  UPDATE shifts
  SET
    total_sales = total_sales + (p_sale->>'total_amount')::BIGINT,
    transaction_count = transaction_count + 1,
    cash_sales_total = cash_sales_total + CASE WHEN p_sale->>'payment_method' = 'cash' THEN (p_sale->>'total_amount')::BIGINT ELSE 0 END,
    card_sales_total = card_sales_total + CASE WHEN p_sale->>'payment_method' = 'card' THEN (p_sale->>'total_amount')::BIGINT ELSE 0 END,
    wallet_sales_total = wallet_sales_total + CASE WHEN p_sale->>'payment_method' = 'wallet' THEN (p_sale->>'total_amount')::BIGINT ELSE 0 END,
    qr_sales_total = qr_sales_total + CASE WHEN p_sale->>'payment_method' = 'qr' THEN (p_sale->>'total_amount')::BIGINT ELSE 0 END,
    updated_at = NOW()
  WHERE id = (p_sale->>'shift_id')::UUID;

  -- 10. Record Audit Log
  INSERT INTO audit_logs (
    user_id,
    store_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    (p_sale->>'cashier_id')::UUID,
    (p_sale->>'store_id')::UUID,
    'pos:sale_ingested',
    'sale',
    v_sale_id::TEXT,
    jsonb_build_object(
      'receipt_number', p_sale->>'receipt_number',
      'total_amount', (p_sale->>'total_amount')::BIGINT,
      'payment_method', p_sale->>'payment_method'
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'sale_id', v_sale_id,
    'receipt_number', p_sale->>'receipt_number'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Shift Reconciliation RPC Function
-- ============================================================================
CREATE OR REPLACE FUNCTION reconcile_and_close_shift(
  p_shift_id UUID,
  p_actual_cash BIGINT,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_expected_cash BIGINT;
  v_variance BIGINT;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift with ID % not found', p_shift_id;
  END IF;

  IF v_shift.status = 'closed' THEN
    RETURN jsonb_build_object(
      'status', 'already_closed',
      'shift_id', v_shift.id,
      'closed_at', v_shift.closed_at
    );
  END IF;

  v_expected_cash := v_shift.opening_float + v_shift.cash_sales_total;
  v_variance := p_actual_cash - v_expected_cash;

  UPDATE shifts
  SET
    status = 'closed',
    closed_at = NOW(),
    closing_cash_actual = p_actual_cash,
    closing_cash_expected = v_expected_cash,
    variance = v_variance,
    notes = CASE WHEN length(p_notes) > 0 THEN p_notes ELSE v_shift.notes END,
    updated_at = NOW()
  WHERE id = p_shift_id;

  INSERT INTO audit_logs (
    user_id,
    store_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    v_shift.cashier_id,
    v_shift.store_id,
    'shift:closed',
    'shift',
    v_shift.id::TEXT,
    jsonb_build_object(
      'opening_float', v_shift.opening_float,
      'closing_cash_actual', p_actual_cash,
      'closing_cash_expected', v_expected_cash,
      'variance', v_variance,
      'total_sales', v_shift.total_sales
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'shift_id', p_shift_id,
    'expected_cash', v_expected_cash,
    'actual_cash', p_actual_cash,
    'variance', v_variance,
    'closed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
