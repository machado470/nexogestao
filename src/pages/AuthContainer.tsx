import { useState } from 'react';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';

export default function AuthContainer() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-screen">
      <div className="hidden md:flex items-center justify-center bg-gray-100">
        <h1 className="text-3xl font-semibold">Bem-vindo ao NexoGestão</h1>
      </div>
      <div className="flex items-center justify-center p-4">
        <div className="bg-white shadow-md rounded w-full max-w-md p-6">
          <div className="flex border-b mb-4">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2 ${activeTab === 'login' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
            >
              Login
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-2 ${activeTab === 'register' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
            >
              Criar Perfil
            </button>
          </div>
          {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </div>
  );
}
