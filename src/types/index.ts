// Core types for the PDV system
export interface Product {
  id: string;
  name: string;
  code: string;
  barcode?: string;
  price: number;
  stock: number;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'cash' | 'card' | 'pix';
  amount: number;
}

export interface Sale {
  id: string;
  cash_session_id: string;
  operator_id: string;
  total_amount: number;
  payment_methods: PaymentMethod[];
  items: CartItem[];
  created_at: string;
}

export interface Operator {
  id: string;
  name: string;
  username: string;
  access_level: 'admin' | 'operator' | 'cashier';
  is_active: boolean;
  created_at: string;
}

export interface CashSession {
  id: string;
  operator_id: string;
  initial_amount: number;
  current_amount: number;
  opened_at: string;
  closed_at?: string;
  is_open: boolean;
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  type: 'withdrawal' | 'supply' | 'sale';
  amount: number;
  description: string;
  created_at: string;
}

export interface Theme {
  isDark: boolean;
}
