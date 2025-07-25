import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const handleLogin = () => {
    console.log('Login:', email, senha);
  };

  return (
    <div>
      <h2>Login</h2>
      <input type='email' value={email} onChange={e => setEmail(e.target.value)} placeholder='E-mail' />
      <input type='password' value={senha} onChange={e => setSenha(e.target.value)} placeholder='Senha' />
      <button onClick={handleLogin}>Entrar</button>
    </div>
  );
}

