import React, { useState } from 'react';
import { ShoppingCart, AlertCircle } from 'lucide-react';
import { Product, CartItem, PaymentMethod, Sale } from '../types';
import { useCashSession } from '../hooks/useCashSession';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ProductSearch } from './ProductSearch';
import { Cart } from './Cart';
import { PaymentModal } from './PaymentModal';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export const PDVScreen: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const { currentSession, addMovement } = useCashSession();
  const { currentUser } = useAuth();

  const handleProductSelect = (product: Product) => {
    if (product.stock <= 0) {
      alert('Produto sem estoque!');
      return;
    }

    const existingItem = cartItems.find(item => item.id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        alert('Quantidade excede o estoque disponível!');
        return;
      }
      
      setCartItems(cartItems.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      const newItem: CartItem = {
        ...product,
        quantity: 1,
        subtotal: product.price
      };
      setCartItems([...cartItems, newItem]);
    }
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(id);
      return;
    }

    const product = cartItems.find(item => item.id === id);
    if (product && quantity > product.stock) {
      alert('Quantidade excede o estoque disponível!');
      return;
    }

    setCartItems(cartItems.map(item =>
      item.id === id
        ? { ...item, quantity, subtotal: quantity * item.price }
        : item
    ));
  };

  const handleRemoveItem = (id: string) => {
    setCartItems(cartItems.filter(item => item.id !== id));
  };

  const handleClearCart = () => {
    if (confirm('Tem certeza que deseja limpar o carrinho?')) {
      setCartItems([]);
    }
  };

  const handleConfirmPayment = async (payments: PaymentMethod[]) => {
    if (!currentSession || !currentUser) return;

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    
    try {
      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          cash_session_id: currentSession.id,
          operator_id: currentUser.id,
          total_amount: total,
          payment_methods: payments,
          items: cartItems
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Update product stock
      for (const item of cartItems) {
        await supabase
          .from('products')
          .update({ stock: item.stock - item.quantity })
          .eq('id', item.id);
      }

      // Add cash movement for cash payments
      const cashPayment = payments
        .filter(p => p.type === 'cash')
        .reduce((sum, p) => sum + p.amount, 0);
      
      if (cashPayment > 0) {
        await addMovement('sale', cashPayment, `Venda #${sale.id}`);
      }

      // Update local state
      setSales([...sales, sale]);
      setCartItems([]);
      setShowPaymentModal(false);

      alert('Venda realizada com sucesso!');
    } catch (error) {
      console.error('Error processing sale:', error);
      alert('Erro ao processar venda. Tente novamente.');
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const canProcessSale = cartItems.length > 0 && currentSession?.is_open;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <ShoppingCart className="w-8 h-8 mr-3 text-blue-600 dark:text-blue-400" />
          Ponto de Venda (PDV)
        </h1>
      </div>

      {!currentSession?.is_open && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <div>
              <h3 className="font-medium text-orange-800 dark:text-orange-200">Caixa Fechado</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Abra o caixa na seção "Caixa" para começar as vendas.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Search and Stats */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Buscar Produtos</h2>
            <ProductSearch onProductSelect={handleProductSelect} />
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="text-center" padding="sm">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sales.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Vendas Hoje</div>
            </Card>
            <Card className="text-center" padding="sm">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                R$ {sales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Vendido</div>
            </Card>
            <Card className="text-center" padding="sm">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{cartItems.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Itens no Carrinho</div>
            </Card>
          </div>
        </div>

        {/* Right Column - Cart */}
        <div className="space-y-6">
          <div className="h-96">
            <Cart
              items={cartItems}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
            />
          </div>

          {cartItems.length > 0 && (
            <Card padding="sm">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xl font-bold">
                  <span className="text-gray-900 dark:text-gray-100">Total:</span>
                  <span className="text-green-600 dark:text-green-400">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <Button
                  onClick={() => setShowPaymentModal(true)}
                  variant="success"
                  size="lg"
                  className="w-full"
                  disabled={!canProcessSale}
                >
                  {!currentSession?.is_open ? 'Abra o caixa primeiro' : 'Finalizar Venda'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        total={cartTotal}
        onConfirmPayment={handleConfirmPayment}
      />
    </div>
  );
};