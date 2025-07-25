require('dotenv').config();
const express = require('express');
const produtosRoutes = require('./routes/produtos.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/produtos', produtosRoutes);

app.get('/', (req, res) => {
  res.send('API NexoGestao funcionando');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
