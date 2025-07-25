import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X } from 'lucide-react';
import { PaymentMethod } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onConfirmPayment: (payments: PaymentMethod[]) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  total,
  onConfirmPayment
}) => {
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'cash' | 'card' | 'pix' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const paymentMethods = [
    { id: 'cash', name: 'Dinheiro', type: 'cash' as const, icon: Banknote },
    { id: 'card', name: 'Cartão', type: 'card' as const, icon: CreditCard },
    { id: 'pix', name: 'PIX', type: 'pix' as const, icon: Smartphone },
  ];

  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingAmount = total - paidAmount;
  const changeAmount = paidAmount > total ? paidAmount - total : 0;

  const handleAddPayment = () => {
    if (!selectedMethod || !paymentAmount || parseFloat(paymentAmount) <= 0) return;

    const amount = parseFloat(paymentAmount);
    const method = paymentMethods.find(m => m.type === selectedMethod);
    
    if (method) {
      setPayments([...payments, { 
        id: Date.now().toString(),
        name: method.name, 
        type: selectedMethod, 
        amount 
      }]);
      setSelectedMethod(null);
      setPaymentAmount('');
    }
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleConfirmPayment = () => {
    if (remainingAmount <= 0) {
      onConfirmPayment(payments);
      setPayments([]);
      onClose();
    }
  };

  const handleClose = () => {
    setPayments([]);
    setSelectedMethod(null);
    setPaymentAmount('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Pagamento" size="lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Formas de Pagamento</h3>
          <div className="grid grid-cols-1 gap-3 mb-4">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.type)}
                  className={`p-4 rounded-lg border-2 transition-all flex items-center space-x-3 ${
                    selectedMethod === method.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{method.name}</span>
                </button>
              );
            })}
          </div>

          {selectedMethod && (
            <div className="space-y-3">
              <Input
                label="Valor"
                type="number"
                placeholder="0,00"
                value={paymentAmount}
                onChange={setPaymentAmount}
              />
              <Button
                onClick={handleAddPayment}
                className="w-full"
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              >
                Adicionar Pagamento
              </Button>
            </div>
          )}
        </div>

        {/* Payment Summary */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Resumo</h3>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">Total da Venda:</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">R$ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">Valor Pago:</span>
              <span className="font-bold text-green-600 dark:text-green-400">R$ {paidAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">Restante:</span>
              <span className="font-bold text-orange-600 dark:text-orange-400">R$ {remainingAmount.toFixed(2)}</span>
            </div>
            {changeAmount > 0 && (
              <div className="flex justify-between text-lg border-t border-gray-200 dark:border-gray-600 pt-3">
                <span className="text-gray-700 dark:text-gray-300">Troco:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">R$ {changeAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Payment List */}
          {payments.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Pagamentos Adicionados:</h4>
              {payments.map((payment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-3 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{payment.name}</span>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      R$ {payment.amount.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemovePayment(index)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleConfirmPayment}
            variant="success"
            className="w-full"
            disabled={remainingAmount > 0}
          >
            {remainingAmount > 0 ? 'Adicione mais pagamentos' : 'Confirmar Venda'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};