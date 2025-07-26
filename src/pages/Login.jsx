import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    await supabase.auth.signInWithPassword({ email, password });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-4">Login</h1>
        <input
          type="email"
          className="border p-2 mb-3 w-full"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="border p-2 mb-4 w-full"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={handleLogin}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}

export default Login;
