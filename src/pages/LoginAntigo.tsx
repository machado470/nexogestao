import { useState, useEffect } from 'react';
import './LoginAntigo.css';

export default function LoginAntigo() {
  const [dataHora, setDataHora] = useState('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const options = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      } as const;
      setDataHora(now.toLocaleDateString('pt-BR', options));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="login-container">
      <div className="login-bg-shape"></div>
      <div className="login-bg-shape"></div>
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="#F97316"/>
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2 text-center">Bem-vindo ao NexoGestão</h2>
        <p id="header-datetime" className="text-sm text-gray-500 text-center">{dataHora}</p>
        <form className="mt-4 flex flex-col gap-4">
          <input type="email" placeholder="Email" className="input" />
          <input type="password" placeholder="Senha" className="input" />
          <button type="submit" className="btn-primary">Entrar</button>
        </form>
      </div>
    </div>
  );
}
