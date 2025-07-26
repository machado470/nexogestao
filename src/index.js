require('dotenv').config();
const express = require('express');
const produtosRoutes = require('./routes/produtos.routes');
const authRoutes = require('../routes/auth.routes');
const sangriaRoutes = require('../routes/sangria.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/produtos', produtosRoutes);
app.use('/api', authRoutes);
app.use('/api', sangriaRoutes);

app.get('/', (req, res) => {
  res.send('API NexoGestao funcionando');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
