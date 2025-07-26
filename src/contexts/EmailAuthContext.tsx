import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface EmailAuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ error?: Error }>;
  signOut: () => Promise<void>;
}

const EmailAuthContext = createContext<EmailAuthContextType | undefined>(
  undefined,
);

export const useEmailAuth = () => {
  const context = useContext(EmailAuthContext);
  if (!context) {
    throw new Error('useEmailAuth must be used within an EmailAuthProvider');
  }
  return context;
};

export const EmailAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    // Check initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ?? undefined };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <EmailAuthContext.Provider value={{ user, session, signIn, signOut }}>
      {children}
    </EmailAuthContext.Provider>
  );
};
