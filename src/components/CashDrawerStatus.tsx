import React from 'react';
import { DollarSign, Clock, User } from 'lucide-react';
import { CashDrawer } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface CashDrawerStatusProps {
  cashDrawer: CashDrawer | null;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onAddWithdrawal: () => void;
  onAddSupply: () => void;
}

export const CashDrawerStatus: React.FC<CashDrawerStatusProps> = ({
  cashDrawer,
  onOpenDrawer,
  onCloseDrawer,
  onAddWithdrawal,
  onAddSupply,
}) => {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center">
          <DollarSign className="w-6 h-6 mr-2" />
          Status do Caixa
        </h2>
      </div>

      {!cashDrawer ? (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-4">Caixa fechado</div>
          <Button onClick={onOpenDrawer} variant="success">
            Abrir Caixa
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600 font-medium">
                Valor Inicial
              </div>
              <div className="text-2xl font-bold text-green-700">
                R$ {cashDrawer.initialAmount.toFixed(2)}
              </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">
                Valor Atual
              </div>
              <div className="text-2xl font-bold text-blue-700">
                R$ {cashDrawer.currentAmount.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              Aberto às {cashDrawer.openedAt.toLocaleTimeString()}
            </div>
            <div className="flex items-center">
              <User className="w-4 h-4 mr-1" />
              {cashDrawer.operator}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="warning" size="sm" onClick={onAddWithdrawal}>
              Sangria
            </Button>
            <Button variant="secondary" size="sm" onClick={onAddSupply}>
              Suprimento
            </Button>
            <Button variant="danger" size="sm" onClick={onCloseDrawer}>
              Fechar Caixa
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
