import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PDVScreen } from './PDVScreen';
import { CashManagement } from './CashManagement';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pdv');

  const renderContent = () => {
    switch (activeTab) {
      case 'pdv':
        return <PDVScreen />;
      case 'cash':
        return <CashManagement />;
      case 'products':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Produtos</h2>
            <p className="text-gray-600 dark:text-gray-400">Módulo em desenvolvimento</p>
          </div>
        );
      case 'customers':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Clientes</h2>
            <p className="text-gray-600 dark:text-gray-400">Módulo em desenvolvimento</p>
          </div>
        );
      case 'reports':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Relatórios</h2>
            <p className="text-gray-600 dark:text-gray-400">Módulo em desenvolvimento</p>
          </div>
        );
      case 'settings':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Configurações</h2>
            <p className="text-gray-600 dark:text-gray-400">Módulo em desenvolvimento</p>
          </div>
        );
      default:
        return <PDVScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};