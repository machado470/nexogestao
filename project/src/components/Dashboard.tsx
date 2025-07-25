import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PDVScreen } from './PDVScreen';
import { CashManagement } from './CashManagement';
import { ProductsRoutes } from './ProductsRoutes';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Clientes from './Clientes.jsx';

const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-center py-12">
    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
    <p className="text-gray-600 dark:text-gray-400">Módulo em desenvolvimento</p>
  </div>
);

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname.split('/')[1] || 'pdv';

  const handleTabChange = (tab: string) => navigate(`/${tab}`);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="pdv" element={<PDVScreen />} />
            <Route path="cash" element={<CashManagement />} />
            <Route path="products/*" element={<ProductsRoutes />} />
            <Route path="customers" element={<Clientes />} />
            <Route path="reports" element={<Placeholder title="Relatórios" />} />
            <Route path="settings" element={<Placeholder title="Configurações" />} />
            <Route path="*" element={<Navigate to="pdv" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};