import React from 'react';
import { DollarSign, Clock, User } from 'lucide-react';
import { useCashSession } from '../hooks/useCashSession';
import { useAuth } from '../contexts/AuthContext';

export const TopBar: React.FC = () => {
  const { currentSession } = useCashSession();
  const { currentUser } = useAuth();

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {new Date().toLocaleDateString('pt-BR', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>

        <div className="flex items-center space-x-6">
          {/* Cash Status */}
          {currentSession ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Caixa: R$ {currentSession.current_amount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Aberto às {new Date(currentSession.opened_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              <DollarSign className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                Caixa Fechado
              </span>
            </div>
          )}

          {/* User Info */}
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{currentUser?.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
};