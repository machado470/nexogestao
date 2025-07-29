const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../config/db');

async function login(req, res) {
  const { email, senha } = req.body;

  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (error || usuarios.length === 0)
    return res.status(401).json({ error: 'Usuário não encontrado' });

  const usuario = usuarios[0];
  const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

  if (!senhaCorreta) return res.status(401).json({ error: 'Senha inválida' });

  const token = jwt.sign(
    {
      id: usuario.id,
      empresa_id: usuario.empresa_id,
      role: usuario.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' },
  );

  res.json({ token });
}

function logout(_req, res) {
  // O front-end pode simplesmente descartar o token JWT
  res.json({ message: 'Logout realizado com sucesso' });
}

module.exports = { login, logout };
