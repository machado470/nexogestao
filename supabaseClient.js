/*
 * supabaseClient.js
 *
 * Este módulo inicializa e exporta um cliente Supabase usando a
 * biblioteca oficial `@supabase/supabase-js`. Para funcionar, é
 * necessário instalar a dependência com `npm install @supabase/supabase-js`
 * e definir as variáveis de ambiente SUPABASE_URL e SUPABASE_KEY
 * no arquivo `.env` ou no ambiente de execução. A `SUPABASE_URL`
 * corresponde à URL do seu projeto Supabase (ex.: https://abc.supabase.co)
 * e `SUPABASE_KEY` deve ser a chave API pública (Anon) ou de serviço,
 * conforme as permissões necessárias.
 */

import { createClient } from '@supabase/supabase-js';

// Lê as variáveis de ambiente. Caso não estejam definidas, o
// Supabase Client será criado com valores undefined e lançará
// erro ao executar chamadas. Certifique-se de definir essas variáveis.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Cria o cliente Supabase. A biblioteca suporta tanto chaves públicas
// (anon) quanto chaves de serviço para uso em back‑end. Para fins de
// segurança, nunca exponha chaves de serviço no front‑end.
export const supabase = createClient(supabaseUrl, supabaseKey);

// Exporte também uma função helper opcional para checar a conexão.
export async function checkConnection() {
  const { data, error } = await supabase.from('pg_tables').select('*').limit(1);
  if (error) {
    console.error('Erro ao verificar conexão com Supabase:', error);
    return false;
  }
  return true;
}