const express = require('express');
const router = express.Router();
const vendasController = require('../controllers/vendasController');
router.post('/vendas', vendasController.registrarVenda);
module.exports = router;
