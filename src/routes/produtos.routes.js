const express = require('express');
const produtosController = require('../controllers/produtos.controller');

const router = express.Router();

router.get('/', produtosController.listarProdutos);
router.get('/:id', produtosController.obterProduto);
router.post('/', produtosController.criarProduto);
router.put('/:id', produtosController.atualizarProduto);
router.delete('/:id', produtosController.removerProduto);

module.exports = router;
