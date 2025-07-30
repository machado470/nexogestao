import { supabase } from './config/supabase.js';

async function testarConexao() {
  const { data, error } = await supabase.from('test_table').select('*');

  if (error) {
    console.error('Erro ao conectar ao Supabase:', error.message);
  } else {
    console.log('Conexão bem-sucedida! Dados:', data);
  }
}

testarConexao();
