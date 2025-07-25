import { useState, useEffect } from 'react';
import { CashSession, CashMovement } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const useCashSession = () => {
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadCurrentSession();
    }
  }, [currentUser]);

  const loadCurrentSession = async () => {
    if (!currentUser) return;

    try {
      const { data: session, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('operator_id', currentUser.id)
        .eq('is_open', true)
        .single();

      if (!error && session) {
        setCurrentSession(session);
        loadMovements(session.id);
      }
    } catch (error) {
      console.error('Error loading cash session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async (sessionId: string) => {
    try {
      const { data: movements, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: false });

      if (!error && movements) {
        setMovements(movements);
      }
    } catch (error) {
      console.error('Error loading movements:', error);
    }
  };

  const openCashSession = async (initialAmount: number): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      const { data: session, error } = await supabase
        .from('cash_sessions')
        .insert({
          operator_id: currentUser.id,
          initial_amount: initialAmount,
          current_amount: initialAmount,
          is_open: true
        })
        .select()
        .single();

      if (!error && session) {
        setCurrentSession(session);
        setMovements([]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error opening cash session:', error);
      return false;
    }
  };

  const closeCashSession = async (): Promise<boolean> => {
    if (!currentSession) return false;

    try {
      const { error } = await supabase
        .from('cash_sessions')
        .update({
          is_open: false,
          closed_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (!error) {
        setCurrentSession(null);
        setMovements([]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error closing cash session:', error);
      return false;
    }
  };

  const addMovement = async (
    type: 'withdrawal' | 'supply' | 'sale',
    amount: number,
    description: string
  ): Promise<boolean> => {
    if (!currentSession) return false;

    try {
      // Add movement record
      const { error: movementError } = await supabase
        .from('cash_movements')
        .insert({
          cash_session_id: currentSession.id,
          type,
          amount,
          description
        });

      if (movementError) return false;

      // Update session current amount
      const newAmount = type === 'withdrawal' 
        ? currentSession.current_amount - amount
        : currentSession.current_amount + amount;

      const { error: sessionError } = await supabase
        .from('cash_sessions')
        .update({ current_amount: newAmount })
        .eq('id', currentSession.id);

      if (sessionError) return false;

      // Update local state
      setCurrentSession({ ...currentSession, current_amount: newAmount });
      await loadMovements(currentSession.id);
      
      return true;
    } catch (error) {
      console.error('Error adding movement:', error);
      return false;
    }
  };

  return {
    currentSession,
    movements,
    loading,
    openCashSession,
    closeCashSession,
    addMovement,
    refreshSession: loadCurrentSession
  };
};