import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

const RegisterForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage('As senhas não conferem');
      return;
    }

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Conta criada com sucesso! Verifique seu e-mail.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="email"
        className="w-full border p-2 rounded"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        className="w-full border p-2 rounded"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <input
        type="password"
        className="w-full border p-2 rounded"
        placeholder="Confirme a Senha"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      {message && <p className="text-sm text-center text-blue-600">{message}</p>}
      <button type="submit" className="w-full bg-blue-500 text-white py-2 rounded">
        Criar Conta
      </button>
    </form>
  );
};

export default RegisterForm;
