const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
router.post('/produtos', produtoController.criarProduto);
router.get('/produtos', produtoController.listarProdutos);
module.exports = router;
