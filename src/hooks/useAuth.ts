import { useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);

  const login = (email: string, senha: string) => {
    console.log('Autenticando', email);
  };

  return { user, login };
}

