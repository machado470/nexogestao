-- NexoGestão PDV Database Schema
-- Execute this SQL in your Supabase SQL Editor

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create operators table
CREATE TABLE IF NOT EXISTS operators (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    access_level VARCHAR(20) DEFAULT 'cashier' CHECK (access_level IN ('admin', 'operator', 'cashier')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(50),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cash_sessions table
CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operator_id UUID NOT NULL REFERENCES operators(id),
    initial_amount DECIMAL(10,2) NOT NULL CHECK (initial_amount >= 0),
    current_amount DECIMAL(10,2) NOT NULL CHECK (current_amount >= 0),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    is_open BOOLEAN DEFAULT true
);

-- Create cash_movements table
CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cash_session_id UUID NOT NULL REFERENCES cash_sessions(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('withdrawal', 'supply', 'sale')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cash_session_id UUID NOT NULL REFERENCES cash_sessions(id),
    operator_id UUID NOT NULL REFERENCES operators(id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
    payment_methods JSONB NOT NULL,
    items JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (Allow all operations for now - customize based on your needs)
CREATE POLICY "Allow all operations on operators" ON operators FOR ALL USING (true);
CREATE POLICY "Allow all operations on products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all operations on cash_sessions" ON cash_sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on cash_movements" ON cash_movements FOR ALL USING (true);
CREATE POLICY "Allow all operations on sales" ON sales FOR ALL USING (true);

-- Insert sample data
-- Default admin user (password: 123456)
INSERT INTO operators (name, username, password_hash, access_level) VALUES 
('Administrador', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Sample products
INSERT INTO products (name, code, barcode, price, stock, category) VALUES 
('Coca-Cola 350ml', '001', '7894900011517', 4.50, 120, 'Bebidas'),
('Pão Francês (kg)', '002', '2000000000024', 8.90, 50, 'Padaria'),
('Leite Integral 1L', '003', '7891000100103', 5.25, 80, 'Laticínios'),
('Arroz Branco 5kg', '004', '7896181900047', 24.90, 35, 'Cereais'),
('Detergente Líquido', '005', '7891182005008', 3.75, 65, 'Limpeza'),
('Açúcar Cristal 1kg', '006', '7891000055557', 4.20, 90, 'Açúcar e Adoçante'),
('Óleo de Soja 900ml', '007', '7891000244401', 6.80, 45, 'Óleos'),
('Macarrão Espaguete 500g', '008', '7891962058504', 3.90, 75, 'Massas'),
('Sabão em Pó 1kg', '009', '7891150056114', 12.50, 30, 'Limpeza'),
('Café Torrado 500g', '010', '7896005200506', 15.90, 25, 'Café');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_operator ON cash_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sales_operator ON sales(operator_id);