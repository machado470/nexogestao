// scripts/listar-produtos.ts
import { supabase } from '../src/config/supabase';

async function listarProdutos() {
  const { data, error } = await supabase.from('produtos').select('*');

  if (error) {
    console.error('Erro ao listar produtos:', error.message);
  } else {
    console.log('Produtos encontrados:');
    console.table(data);
  }
}

listarProdutos();
