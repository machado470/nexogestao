import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { getClientes, addCliente } from '../services/clientesService';

const initialForm = { nome: '', cpf: '', telefone: '', email: '' };

function validarCPF(cpf) {
  const cleaned = cpf.replace(/[^\d]+/g, '');
  if (cleaned.length !== 11 || /^(\\d)\1+$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleaned.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleaned.charAt(10))) return false;
  return true;
}

export const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const loadClientes = async () => {
    try {
      const data = await getClientes();
      setClientes(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadClientes();
  }, []);

  const handleChange = (field) => (value) => {
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nome || !form.cpf || !form.telefone || !form.email) {
      setError('Preencha todos os campos');
      return;
    }
    if (!validarCPF(form.cpf)) {
      setError('CPF inválido');
      return;
    }
    try {
      await addCliente(form);
      setForm(initialForm);
      loadClientes();
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clientes</h1>

      <Card>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input label="Nome" value={form.nome} onChange={handleChange('nome')} required />
          <Input label="CPF" value={form.cpf} onChange={handleChange('cpf')} required />
          <Input label="Telefone" value={form.telefone} onChange={handleChange('telefone')} type="tel" required />
          <Input label="E-mail" value={form.email} onChange={handleChange('email')} type="email" required />
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex justify-end">
            <Button type="submit" variant="success">Adicionar</Button>
          </div>
        </form>
      </Card>

      <Card>
        {clientes.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">Nenhum cliente cadastrado</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">CPF</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Telefone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">E-mail</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{c.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{c.cpf}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{c.telefone}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{c.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default Clientes;
