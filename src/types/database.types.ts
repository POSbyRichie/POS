export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          code: string;
          name: string;
          tagline: string;
          address: string;
          phone: string;
          email: string;
          tax_id: string;
          currency_code: string;
          currency_symbol: string;
          currency_decimals: number;
          loyalty_rate: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          tagline?: string;
          address: string;
          phone: string;
          email?: string;
          tax_id: string;
          currency_code?: string;
          currency_symbol?: string;
          currency_decimals?: number;
          loyalty_rate?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          tagline?: string;
          address?: string;
          phone?: string;
          email?: string;
          tax_id?: string;
          currency_code?: string;
          currency_symbol?: string;
          currency_decimals?: number;
          loyalty_rate?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      roles: {
        Row: {
          id: string;
          name: string;
          description: string;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      permissions: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          category: string;
          description?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          description?: string;
          created_at?: string;
        };
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
          created_at?: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string;
          role_id: string;
          username: string;
          full_name: string;
          phone: string;
          avatar_url: string;
          pin_hash: string;
          salt: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          store_id: string;
          role_id: string;
          username: string;
          full_name: string;
          phone?: string;
          avatar_url?: string;
          pin_hash: string;
          salt: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          store_id?: string;
          role_id?: string;
          username?: string;
          full_name?: string;
          phone?: string;
          avatar_url?: string;
          pin_hash?: string;
          salt?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      registers: {
        Row: {
          id: string;
          store_id: string;
          register_number: string;
          register_name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          register_number: string;
          register_name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          register_number?: string;
          register_name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      devices: {
        Row: {
          id: string;
          register_id: string;
          device_name: string;
          fingerprint: string;
          is_authorized: boolean;
          enrolled_at: string;
          last_active_at: string;
        };
        Insert: {
          id: string;
          register_id: string;
          device_name: string;
          fingerprint?: string;
          is_authorized?: boolean;
          enrolled_at?: string;
          last_active_at?: string;
        };
        Update: {
          id?: string;
          register_id?: string;
          device_name?: string;
          fingerprint?: string;
          is_authorized?: boolean;
          enrolled_at?: string;
          last_active_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          store_id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          color: string;
          icon: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          category_id: string;
          sku: string;
          barcode: string;
          name: string;
          description: string;
          cost_price: number;
          selling_price: number;
          tax_rate: number;
          unit: string;
          min_stock_level: number;
          image_url: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          category_id: string;
          sku: string;
          barcode: string;
          name: string;
          description?: string;
          cost_price?: number;
          selling_price: number;
          tax_rate?: number;
          unit?: string;
          min_stock_level?: number;
          image_url?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          category_id?: string;
          sku?: string;
          barcode?: string;
          name?: string;
          description?: string;
          cost_price?: number;
          selling_price?: number;
          tax_rate?: number;
          unit?: string;
          min_stock_level?: number;
          image_url?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          quantity: number;
          low_stock_threshold: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          quantity?: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          product_id?: string;
          quantity?: number;
          low_stock_threshold?: number;
          updated_at?: string;
        };
      };
      inventory_movements: {
        Row: {
          id: string;
          idempotency_key: string;
          store_id: string;
          product_id: string;
          register_id: string | null;
          shift_id: string | null;
          type: 'RESTOCK' | 'SALE' | 'DAMAGE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
          quantity_delta: number;
          previous_quantity: number;
          new_quantity: number;
          reference_id: string | null;
          user_id: string;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          store_id: string;
          product_id: string;
          register_id?: string | null;
          shift_id?: string | null;
          type: 'RESTOCK' | 'SALE' | 'DAMAGE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
          quantity_delta: number;
          previous_quantity: number;
          new_quantity: number;
          reference_id?: string | null;
          user_id: string;
          notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          store_id?: string;
          product_id?: string;
          register_id?: string | null;
          shift_id?: string | null;
          type?: 'RESTOCK' | 'SALE' | 'DAMAGE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
          quantity_delta?: number;
          previous_quantity?: number;
          new_quantity?: number;
          reference_id?: string | null;
          user_id?: string;
          notes?: string;
          created_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string;
          loyalty_number: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string;
          loyalty_number?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string;
          loyalty_number?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      loyalty_accounts: {
        Row: {
          id: string;
          customer_id: string;
          points_balance: number;
          lifetime_points_earned: number;
          lifetime_points_redeemed: number;
          tier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          points_balance?: number;
          lifetime_points_earned?: number;
          lifetime_points_redeemed?: number;
          tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          points_balance?: number;
          lifetime_points_earned?: number;
          lifetime_points_redeemed?: number;
          tier?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      loyalty_transactions: {
        Row: {
          id: string;
          idempotency_key: string;
          customer_id: string;
          sale_id: string | null;
          type: 'EARN' | 'REDEEM' | 'ADJUST';
          points_delta: number;
          previous_points: number;
          new_points: number;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          customer_id: string;
          sale_id?: string | null;
          type: 'EARN' | 'REDEEM' | 'ADJUST';
          points_delta: number;
          previous_points: number;
          new_points: number;
          notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          customer_id?: string;
          sale_id?: string | null;
          type?: 'EARN' | 'REDEEM' | 'ADJUST';
          points_delta?: number;
          previous_points?: number;
          new_points?: number;
          notes?: string;
          created_at?: string;
        };
      };
      shifts: {
        Row: {
          id: string;
          idempotency_key: string;
          store_id: string;
          register_id: string;
          cashier_id: string;
          status: 'open' | 'closed';
          opened_at: string;
          closed_at: string | null;
          opening_float: number;
          closing_cash_actual: number | null;
          closing_cash_expected: number | null;
          variance: number | null;
          total_sales: number;
          transaction_count: number;
          cash_sales_total: number;
          card_sales_total: number;
          wallet_sales_total: number;
          qr_sales_total: number;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          store_id: string;
          register_id: string;
          cashier_id: string;
          status?: 'open' | 'closed';
          opened_at?: string;
          closed_at?: string | null;
          opening_float?: number;
          closing_cash_actual?: number | null;
          closing_cash_expected?: number | null;
          variance?: number | null;
          total_sales?: number;
          transaction_count?: number;
          cash_sales_total?: number;
          card_sales_total?: number;
          wallet_sales_total?: number;
          qr_sales_total?: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          store_id?: string;
          register_id?: string;
          cashier_id?: string;
          status?: 'open' | 'closed';
          opened_at?: string;
          closed_at?: string | null;
          opening_float?: number;
          closing_cash_actual?: number | null;
          closing_cash_expected?: number | null;
          variance?: number | null;
          total_sales?: number;
          transaction_count?: number;
          cash_sales_total?: number;
          card_sales_total?: number;
          wallet_sales_total?: number;
          qr_sales_total?: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          idempotency_key: string;
          receipt_number: string;
          store_id: string;
          register_id: string;
          shift_id: string;
          cashier_id: string;
          customer_id: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total_amount: number;
          amount_paid: number;
          change_amount: number;
          payment_method: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          payment_status: 'paid' | 'refunded' | 'cancelled';
          items_count: number;
          notes: string;
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          receipt_number: string;
          store_id: string;
          register_id: string;
          shift_id: string;
          cashier_id: string;
          customer_id?: string | null;
          subtotal: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount: number;
          amount_paid: number;
          change_amount?: number;
          payment_method: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          payment_status?: 'paid' | 'refunded' | 'cancelled';
          items_count?: number;
          notes?: string;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          receipt_number?: string;
          store_id?: string;
          register_id?: string;
          shift_id?: string;
          cashier_id?: string;
          customer_id?: string | null;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number;
          amount_paid?: number;
          change_amount?: number;
          payment_method?: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          payment_status?: 'paid' | 'refunded' | 'cancelled';
          items_count?: number;
          notes?: string;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          sku: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          discount_amount: number;
          tax_rate: number;
          total_price: number;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          sku: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          discount_amount?: number;
          tax_rate?: number;
          total_price: number;
          notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          sku?: string;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          discount_amount?: number;
          tax_rate?: number;
          total_price?: number;
          notes?: string;
          created_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          idempotency_key: string;
          sale_id: string;
          payment_method: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          amount: number;
          currency: string;
          status: 'successful' | 'failed' | 'refunded';
          created_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          sale_id: string;
          payment_method: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          amount: number;
          currency?: string;
          status?: 'successful' | 'failed' | 'refunded';
          created_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          sale_id?: string;
          payment_method?: 'cash' | 'card' | 'wallet' | 'qr' | 'split';
          amount?: number;
          currency?: string;
          status?: 'successful' | 'failed' | 'refunded';
          created_at?: string;
        };
      };
      payment_items: {
        Row: {
          id: string;
          payment_id: string;
          method: string;
          amount_paid: number;
          change_given: number;
          reference: string;
          provider_response: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          method: string;
          amount_paid: number;
          change_given?: number;
          reference?: string;
          provider_response?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string;
          method?: string;
          amount_paid?: number;
          change_given?: number;
          reference?: string;
          provider_response?: Json;
          created_at?: string;
        };
      };
      receipts: {
        Row: {
          id: string;
          sale_id: string;
          receipt_number: string;
          content_json: Json;
          printed_at: string | null;
          email_queued: boolean;
          sms_queued: boolean;
          email_recipient: string | null;
          sms_recipient: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          receipt_number: string;
          content_json: Json;
          printed_at?: string | null;
          email_queued?: boolean;
          sms_queued?: boolean;
          email_recipient?: string | null;
          sms_recipient?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          receipt_number?: string;
          content_json?: Json;
          printed_at?: string | null;
          email_queued?: boolean;
          sms_queued?: boolean;
          email_recipient?: string | null;
          sms_recipient?: string | null;
          created_at?: string;
        };
      };
      sync_queue: {
        Row: {
          id: number;
          idempotency_key: string;
          store_id: string;
          register_id: string | null;
          entity_type: string;
          entity_id: string;
          operation: 'INSERT' | 'UPDATE' | 'DELETE';
          payload: Json;
          attempts: number;
          max_attempts: number;
          status: 'pending' | 'in_progress' | 'synced' | 'failed';
          last_attempt_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          idempotency_key: string;
          store_id: string;
          register_id?: string | null;
          entity_type: string;
          entity_id: string;
          operation: 'INSERT' | 'UPDATE' | 'DELETE';
          payload: Json;
          attempts?: number;
          max_attempts?: number;
          status?: 'pending' | 'in_progress' | 'synced' | 'failed';
          last_attempt_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          idempotency_key?: string;
          store_id?: string;
          register_id?: string | null;
          entity_type?: string;
          entity_id?: string;
          operation?: 'INSERT' | 'UPDATE' | 'DELETE';
          payload?: Json;
          attempts?: number;
          max_attempts?: number;
          status?: 'pending' | 'in_progress' | 'synced' | 'failed';
          last_attempt_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: number;
          user_id: string | null;
          store_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Json;
          ip_address: string;
          user_agent: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          store_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details?: Json;
          ip_address?: string;
          user_agent?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          store_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          details?: Json;
          ip_address?: string;
          user_agent?: string;
          created_at?: string;
        };
      };
    };
    Functions: {
      ingest_pos_sale: {
        Args: {
          p_sale: Json;
          p_items: Json;
          p_payment: Json;
          p_payment_items: Json;
          p_receipt: Json;
          p_movements: Json;
          p_loyalty_tx?: Json;
        };
        Returns: Json;
      };
      reconcile_and_close_shift: {
        Args: {
          p_shift_id: string;
          p_actual_cash: number;
          p_notes?: string;
        };
        Returns: Json;
      };
    };
  };
}
