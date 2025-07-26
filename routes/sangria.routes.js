const express = require('express');
const router = express.Router();
const { registrarSangria } = require('../controllers/sangriaController');
const auth = require('../middlewares/authMiddleware');

router.post('/sangria', auth, registrarSangria);

module.exports = router;
