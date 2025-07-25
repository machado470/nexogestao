import React, { createContext, useContext, useState, useEffect } from 'react';
import { Operator } from '../types';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';

interface AuthContextType {
  currentUser: Operator | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in (from localStorage)
    const savedUser = localStorage.getItem('nexogestao_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const { data: operator, error } = await supabase
        .from('operators')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .single();

      if (error || !operator) {
        return false;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, operator.password_hash);
      if (!isValidPassword) {
        return false;
      }

      // Remove password_hash from the user object before storing
      const { password_hash, ...userWithoutPassword } = operator;
      setCurrentUser(userWithoutPassword as Operator);
      localStorage.setItem('nexogestao_user', JSON.stringify(userWithoutPassword));
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('nexogestao_user');
  };

  const value = {
    currentUser,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};