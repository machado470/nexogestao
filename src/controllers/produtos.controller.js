import { supabase } from '../config/supabase.js';

// GET /produtos
export async function listarProdutos(req, res) {
  const { data, error } = await supabase.from('produtos').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
}

// POST /produtos
export async function criarProduto(req, res) {
  const { nome, descricao, preco } = req.body;

  const { data, error } = await supabase
    .from('produtos')
    .insert([{ nome, descricao, preco }])
    .select();

  if (error) return res.status(500).json({ error });
  res.status(201).json(data[0]);
}

// rota PUT aqui
