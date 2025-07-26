const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('produtos').select('*');

    if (error) {
      console.error('Erro Supabase:', error.message);
      return res.status(500).json({ erro: 'Erro ao buscar produtos' });
    }

    if (!Array.isArray(data)) {
      console.error('Resposta inválida:', data);
      return res.status(500).json({ erro: 'Dados inesperados recebidos' });
    }

    res.json(data);
  } catch (err) {
    console.error('Erro inesperado:', err.stack);
    res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});

module.exports = router;
