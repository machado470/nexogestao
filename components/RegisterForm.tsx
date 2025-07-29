import { useState } from 'react';

export default function RegisterForm() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const handleRegister = () => {
    console.log('Cadastro:', nome, email, senha);
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className="block mb-4 p-2 border w-full"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="block mb-4 p-2 border w-full"
      />
      <input
        type="password"
        placeholder="Senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        className="block mb-4 p-2 border w-full"
      />
      <button
        onClick={handleRegister}
        className="px-4 py-2 bg-green-600 text-white rounded"
      >
        Criar Conta
      </button>
    </div>
  );
}
