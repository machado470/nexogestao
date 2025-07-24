import { Product, PaymentMethod } from '../types';

export const mockProducts: Product[] = [
  {
    id: '1',
    code: '001',
    name: 'Coca-Cola 350ml',
    price: 4.50,
    category: 'Bebidas',
    stock: 120,
    barcode: '7894900011517'
  },
  {
    id: '2',
    code: '002',
    name: 'Pão Francês (kg)',
    price: 8.90,
    category: 'Padaria',
    stock: 50,
    barcode: '2000000000024'
  },
  {
    id: '3',
    code: '003',
    name: 'Leite Integral 1L',
    price: 5.25,
    category: 'Laticínios',
    stock: 80,
    barcode: '7891000100103'
  },
  {
    id: '4',
    code: '004',
    name: 'Arroz Branco 5kg',
    price: 24.90,
    category: 'Cereais',
    stock: 35,
    barcode: '7896181900047'
  },
  {
    id: '5',
    code: '005',
    name: 'Detergente Líquido',
    price: 3.75,
    category: 'Limpeza',
    stock: 65,
    barcode: '7891182005008'
  }
];

export const paymentMethods: PaymentMethod[] = [
  { id: '1', name: 'Dinheiro', type: 'money', icon: 'Banknote' },
  { id: '2', name: 'Cartão Débito', type: 'card', icon: 'CreditCard' },
  { id: '3', name: 'Cartão Crédito', type: 'card', icon: 'CreditCard' },
  { id: '4', name: 'PIX', type: 'pix', icon: 'Smartphone' },
  { id: '5', name: 'Vale Alimentação', type: 'voucher', icon: 'Ticket' }
];