import React from 'react';
import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { CartItem } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
}

export const Cart: React.FC<CartProps> = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <ShoppingCart className="w-6 h-6 mr-2" />
          Carrinho
        </h2>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearCart}>
            Limpar
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {items.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Carrinho vazio</p>
            <p className="text-sm">Adicione produtos para começar</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight">
                    {item.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Código: {item.code}
                  </p>
                </div>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center transition-colors"
                    disabled={item.quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-medium text-gray-900 dark:text-gray-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    R$ {item.price.toFixed(2)} cada
                  </div>
                  <div className="font-bold text-green-600 dark:text-green-400">
                    R$ {item.subtotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
          <div className="flex items-center justify-between text-xl font-bold">
            <span className="text-gray-900 dark:text-gray-100">Total:</span>
            <span className="text-green-600 dark:text-green-400">
              R$ {total.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};
