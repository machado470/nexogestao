import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let clients = [];
let products = [];

// Clients endpoints
app.get('/api/clients', (req, res) => {
  res.json(clients);
});

app.post('/api/clients', (req, res) => {
  const client = { id: Date.now().toString(), ...req.body };
  clients.push(client);
  res.status(201).json(client);
});

app.get('/api/clients/:id', (req, res) => {
  const client = clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

app.put('/api/clients/:id', (req, res) => {
  const index = clients.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  clients[index] = { ...clients[index], ...req.body };
  res.json(clients[index]);
});

app.delete('/api/clients/:id', (req, res) => {
  clients = clients.filter(c => c.id !== req.params.id);
  res.status(204).end();
});

// Products endpoints
app.get('/api/products', (req, res) => {
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const product = { id: Date.now().toString(), ...req.body };
  products.push(product);
  res.status(201).json(product);
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

app.put('/api/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  products[index] = { ...products[index], ...req.body };
  res.json(products[index]);
});

app.delete('/api/products/:id', (req, res) => {
  products = products.filter(p => p.id !== req.params.id);
  res.status(204).end();
});

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
