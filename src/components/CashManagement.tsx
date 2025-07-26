import React, { useState } from 'react';
import {
  DollarSign,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useCashSession } from '../hooks/useCashSession';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

export const CashManagement: React.FC = () => {
  const {
    currentSession,
    movements,
    openCashSession,
    closeCashSession,
    addMovement,
  } = useCashSession();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'withdrawal' | 'supply'>(
    'withdrawal',
  );
  const [initialAmount, setInitialAmount] = useState('100.00');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');

  const handleOpenCash = async () => {
    const amount = parseFloat(initialAmount);
    if (amount > 0) {
      const success = await openCashSession(amount);
      if (success) {
        setShowOpenModal(false);
        setInitialAmount('100.00');
      }
    }
  };

  const handleCloseCash = async () => {
    if (confirm('Tem certeza que deseja fechar o caixa?')) {
      await closeCashSession();
    }
  };

  const handleMovement = async () => {
    const amount = parseFloat(movementAmount);
    if (amount > 0 && movementDescription.trim()) {
      const success = await addMovement(
        movementType,
        amount,
        movementDescription,
      );
      if (success) {
        setShowMovementModal(false);
        setMovementAmount('');
        setMovementDescription('');
      }
    }
  };

  const openMovementModal = (type: 'withdrawal' | 'supply') => {
    setMovementType(type);
    setShowMovementModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Gerenciamento de Caixa
        </h1>
      </div>

      {!currentSession ? (
        <Card className="text-center py-12">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Caixa Fechado
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Abra o caixa para começar as operações
          </p>
          <Button
            onClick={() => setShowOpenModal(true)}
            variant="success"
            size="lg"
          >
            Abrir Caixa
          </Button>
        </Card>
      ) : (
        <>
          {/* Cash Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Valor Inicial
                  </p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    R$ {currentSession.initial_amount.toFixed(2)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Valor Atual
                  </p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    R$ {currentSession.current_amount.toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Diferença
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      currentSession.current_amount >=
                      currentSession.initial_amount
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    R${' '}
                    {(
                      currentSession.current_amount -
                      currentSession.initial_amount
                    ).toFixed(2)}
                  </p>
                </div>
                <TrendingDown className="w-8 h-8 text-gray-600 dark:text-gray-400" />
              </div>
            </Card>
          </div>

          {/* Actions */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Ações do Caixa
              </h2>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Aberto em: {new Date(currentSession.opened_at).toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => openMovementModal('withdrawal')}
                variant="warning"
                className="flex items-center justify-center"
              >
                <Minus className="w-5 h-5 mr-2" />
                Sangria
              </Button>

              <Button
                onClick={() => openMovementModal('supply')}
                variant="secondary"
                className="flex items-center justify-center"
              >
                <Plus className="w-5 h-5 mr-2" />
                Suprimento
              </Button>

              <Button
                onClick={handleCloseCash}
                variant="danger"
                className="flex items-center justify-center"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                Fechar Caixa
              </Button>
            </div>
          </Card>

          {/* Movements History */}
          <Card>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
              Histórico de Movimentações
            </h2>

            {movements.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Nenhuma movimentação registrada
              </div>
            ) : (
              <div className="space-y-3">
                {movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          movement.type === 'withdrawal'
                            ? 'bg-red-100 dark:bg-red-900/20'
                            : movement.type === 'supply'
                              ? 'bg-blue-100 dark:bg-blue-900/20'
                              : 'bg-green-100 dark:bg-green-900/20'
                        }`}
                      >
                        {movement.type === 'withdrawal' ? (
                          <Minus className="w-5 h-5 text-red-600 dark:text-red-400" />
                        ) : movement.type === 'supply' ? (
                          <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {movement.type === 'withdrawal'
                            ? 'Sangria'
                            : movement.type === 'supply'
                              ? 'Suprimento'
                              : 'Venda'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {movement.description}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {new Date(movement.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        movement.type === 'withdrawal'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {movement.type === 'withdrawal' ? '-' : '+'}R${' '}
                      {movement.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Open Cash Modal */}
      <Modal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        title="Abrir Caixa"
      >
        <div className="space-y-4">
          <Input
            label="Valor Inicial"
            type="number"
            placeholder="100.00"
            value={initialAmount}
            onChange={setInitialAmount}
            required
          />
          <div className="flex space-x-3">
            <Button
              onClick={() => setShowOpenModal(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleOpenCash}
              variant="success"
              className="flex-1"
            >
              Abrir Caixa
            </Button>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal
        isOpen={showMovementModal}
        onClose={() => setShowMovementModal(false)}
        title={movementType === 'withdrawal' ? 'Sangria' : 'Suprimento'}
      >
        <div className="space-y-4">
          <Input
            label="Valor"
            type="number"
            placeholder="0.00"
            value={movementAmount}
            onChange={setMovementAmount}
            required
          />
          <Input
            label="Descrição"
            placeholder="Motivo da movimentação"
            value={movementDescription}
            onChange={setMovementDescription}
            required
          />
          <div className="flex space-x-3">
            <Button
              onClick={() => setShowMovementModal(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMovement}
              variant={movementType === 'withdrawal' ? 'warning' : 'secondary'}
              className="flex-1"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
