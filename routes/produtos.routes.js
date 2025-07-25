const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('produtos').select('*');

  if (error) {
    return res.status(500).json({ erro: error.message });
  }

  res.json(data);
});

module.exports = router;
