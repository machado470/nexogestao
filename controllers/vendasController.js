/* global exports */
exports.registrarVenda = async (req, res) => {
  const dados = req.body;
  const total = dados.itens.reduce(
    (acc, item) => acc + item.quantidade * item.precoUnitario,
    0,
  );
  dados.total = total;
  dados.data = new Date();
  res.status(201).json({ mensagem: 'Venda registrada', venda: dados });
};
