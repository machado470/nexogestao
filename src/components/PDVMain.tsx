import React, { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Product, CartItem, CashDrawer, Sale, Payment } from '../types';
import { ProductSearch } from './ProductSearch';
import { Cart } from './Cart';
import { PaymentModal } from './PaymentModal';
import { CashDrawerStatus } from './CashDrawerStatus';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export const PDVMain: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cashDrawer, setCashDrawer] = useState<CashDrawer | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);

  const handleProductSelect = (product: Product) => {
    const existingItem = cartItems.find((item) => item.id === product.id);

    if (existingItem) {
      setCartItems(
        cartItems.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.price,
              }
            : item,
        ),
      );
    } else {
      const newItem: CartItem = {
        ...product,
        quantity: 1,
        subtotal: product.price,
      };
      setCartItems([...cartItems, newItem]);
    }
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(id);
      return;
    }

    setCartItems(
      cartItems.map((item) =>
        item.id === id
          ? { ...item, quantity, subtotal: quantity * item.price }
          : item,
      ),
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleOpenDrawer = () => {
    const initialAmount = 100; // This would come from a form
    setCashDrawer({
      isOpen: true,
      initialAmount,
      currentAmount: initialAmount,
      openedAt: new Date(),
      operator: 'Operador 01',
    });
  };

  const handleCloseDrawer = () => {
    setCashDrawer(null);
  };

  const handleAddWithdrawal = () => {
    // Implementation for withdrawal (sangria)
    console.log('Add withdrawal');
  };

  const handleAddSupply = () => {
    // Implementation for supply (suprimento)
    console.log('Add supply');
  };

  const handleConfirmPayment = (payments: Payment[]) => {
    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    const newSale: Sale = {
      id: Date.now().toString(),
      items: [...cartItems],
      total,
      payments,
      operator: cashDrawer?.operator || 'Operador',
      timestamp: new Date(),
    };

    setSales([...sales, newSale]);
    setCartItems([]);
    setShowPaymentModal(false);

    // Update cash drawer
    if (cashDrawer) {
      const cashPayment = payments
        .filter((p) => p.method.type === 'money')
        .reduce((sum, p) => sum + p.amount, 0);

      setCashDrawer({
        ...cashDrawer,
        currentAmount: cashDrawer.currentAmount + cashPayment,
      });
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const canProcessSale = cartItems.length > 0 && cashDrawer?.isOpen;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <ShoppingCart className="w-8 h-8 mr-3 text-blue-600" />
            Sistema PDV
          </h1>
          <div className="text-sm text-gray-600">
            {new Date().toLocaleDateString('pt-BR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Product Search and Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Buscar Produtos
              </h2>
              <ProductSearch onProductSelect={handleProductSelect} />
            </Card>

            <CashDrawerStatus
              cashDrawer={cashDrawer}
              onOpenDrawer={handleOpenDrawer}
              onCloseDrawer={handleCloseDrawer}
              onAddWithdrawal={handleAddWithdrawal}
              onAddSupply={handleAddSupply}
            />

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="text-center" padding="sm">
                <div className="text-2xl font-bold text-blue-600">
                  {sales.length}
                </div>
                <div className="text-sm text-gray-600">Vendas Hoje</div>
              </Card>
              <Card className="text-center" padding="sm">
                <div className="text-2xl font-bold text-green-600">
                  R${' '}
                  {sales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Total Vendido</div>
              </Card>
              <Card className="text-center" padding="sm">
                <div className="text-2xl font-bold text-orange-600">
                  {cartItems.length}
                </div>
                <div className="text-sm text-gray-600">Itens no Carrinho</div>
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
                    <span>Total:</span>
                    <span className="text-green-600">
                      R$ {cartTotal.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    onClick={() => setShowPaymentModal(true)}
                    variant="success"
                    size="lg"
                    className="w-full"
                    disabled={!canProcessSale}
                  >
                    {!cashDrawer?.isOpen
                      ? 'Abra o caixa primeiro'
                      : 'Finalizar Venda'}
                  </Button>
                </div>
              </Card>
            )}
          </div>
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
