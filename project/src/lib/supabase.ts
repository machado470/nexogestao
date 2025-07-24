import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface Database {
  public: {
    Tables: {
      operators: {
        Row: {
          id: string;
          name: string;
          username: string;
          password_hash: string;
          access_level: 'admin' | 'operator' | 'cashier';
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          username: string;
          password_hash: string;
          access_level?: 'admin' | 'operator' | 'cashier';
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          username?: string;
          password_hash?: string;
          access_level?: 'admin' | 'operator' | 'cashier';
          is_active?: boolean;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          code: string;
          barcode: string | null;
          price: number;
          stock: number;
          category: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          barcode?: string | null;
          price: number;
          stock: number;
          category: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          barcode?: string | null;
          price?: number;
          stock?: number;
          category?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      cash_sessions: {
        Row: {
          id: string;
          operator_id: string;
          initial_amount: number;
          current_amount: number;
          opened_at: string;
          closed_at: string | null;
          is_open: boolean;
        };
        Insert: {
          id?: string;
          operator_id: string;
          initial_amount: number;
          current_amount: number;
          opened_at?: string;
          closed_at?: string | null;
          is_open?: boolean;
        };
        Update: {
          id?: string;
          operator_id?: string;
          initial_amount?: number;
          current_amount?: number;
          opened_at?: string;
          closed_at?: string | null;
          is_open?: boolean;
        };
      };
      cash_movements: {
        Row: {
          id: string;
          cash_session_id: string;
          type: 'withdrawal' | 'supply' | 'sale';
          amount: number;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cash_session_id: string;
          type: 'withdrawal' | 'supply' | 'sale';
          amount: number;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cash_session_id?: string;
          type?: 'withdrawal' | 'supply' | 'sale';
          amount?: number;
          description?: string;
          created_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          cash_session_id: string;
          operator_id: string;
          total_amount: number;
          payment_methods: any;
          items: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          cash_session_id: string;
          operator_id: string;
          total_amount: number;
          payment_methods: any;
          items: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          cash_session_id?: string;
          operator_id?: string;
          total_amount?: number;
          payment_methods?: any;
          items?: any;
          created_at?: string;
        };
      };
    };
  };
}