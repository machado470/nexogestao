/* global exports */
exports.criarProduto = async (req, res) => {
  const dados = req.body;
  res.status(201).json({ mensagem: 'Produto criado', dados });
};
exports.listarProdutos = async (req, res) => {
  res.status(200).json([{ nome: 'Mouse', preco: 99.9 }]);
};
