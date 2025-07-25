import React, { useState } from 'react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';

export const SplitLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: add login logic
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: add registration logic
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="w-full md:w-1/2 flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <Card className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-gray-100">Entrar</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="Digite seu e-mail"
              value={email}
              onChange={setEmail}
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={setPassword}
              required
            />
            <Button type="submit" variant="primary" size="lg" className="w-full">
              Entrar
            </Button>
          </form>
        </Card>
      </div>
      <div className="hidden md:flex w-1/2 items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 p-8">
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">Novo por aqui?</h2>
          <Button
            variant="outline"
            size="lg"
            className="text-white border-white hover:bg-white hover:text-blue-600"
            onClick={() => setIsModalOpen(true)}
          >
            Criar Conta
          </Button>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Criar Conta">
        <form onSubmit={handleRegister} className="space-y-4">
          <Input label="Nome" placeholder="Digite seu nome" value={name} onChange={setName} required />
          <Input label="E-mail" type="email" placeholder="Digite seu e-mail" value={regEmail} onChange={setRegEmail} required />
          <Input label="Senha" type="password" placeholder="Crie uma senha" value={regPassword} onChange={setRegPassword} required />
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Registrar
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default SplitLoginPage;
