const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

router.get('/', async function (req, res) {
  try {
    const { data, error } = await supabase.from('produtos').select('*');

    if (error) {
      return res.status(500).json({ erro: error.message });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao consultar produtos:', error);
    return res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});

module.exports = router;
