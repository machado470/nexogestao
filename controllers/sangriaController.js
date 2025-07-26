const supabase = require('../config/db');

async function registrarSangria(req, res) {
  const { valor, motivo, caixa_id } = req.body;
  const { id: usuario_id, empresa_id } = req.user;

  const { data, error } = await supabase
    .from('sangrias')
    .insert([{ valor, motivo, caixa_id, usuario_id, empresa_id }]);

  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({ message: 'Sangria registrada com sucesso', data });
}

module.exports = { registrarSangria };
