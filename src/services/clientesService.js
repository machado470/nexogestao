import { supabase } from '../lib/supabase';

export const getClientes = async () => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nome');
  if (error) throw error;
  return data;
};

export const addCliente = async (cliente) => {
  const { data, error } = await supabase
    .from('clientes')
    .insert(cliente)
    .select()
    .single();
  if (error) throw error;
  return data;
};
