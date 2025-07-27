import { useState } from "react";
import LoginForm from "../components/LoginForm";
import RegisterForm from "../components/RegisterForm";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="flex h-screen">
      <div className="w-1/2 bg-gray-100 flex items-center justify-center">
        <h1 className="text-3xl font-bold">Bem-vindo ao NexoGestão</h1>
      </div>
      <div className="w-1/2 p-8">
        <div className="flex gap-4 mb-6">
          <button onClick={() => setIsLogin(true)} className="px-4 py-2 bg-blue-500 text-white rounded">Entrar</button>
          <button onClick={() => setIsLogin(false)} className="px-4 py-2 bg-green-500 text-white rounded">Criar Conta</button>
        </div>
        {isLogin ? <LoginForm /> : <RegisterForm />}
      </div>
    </div>
  );
}
