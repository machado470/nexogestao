/* global exports */
exports.criarCliente = async (req, res) => {
  const dados = req.body;
  res.status(201).json({ mensagem: 'Cliente criado', dados });
};
exports.listarClientes = async (req, res) => {
  res.status(200).json([{ nome: 'Exemplo', email: 'ex@emplo.com' }]);
};
