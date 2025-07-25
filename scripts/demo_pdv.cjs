/*
 * demo.js
 *
 * This script demonstrates how to use the PDV core classes: Product,
 * Catalog, Sale, and CashRegister. Run it with `node demo.js` to
 * simulate a small sale and cash register operations.
 */

const Product = require('../src/services/pdv/Product');
const Catalog = require('../src/services/pdv/Catalog');
const Sale = require('../src/services/pdv/Sale');
const CashRegister = require('../src/services/pdv/CashRegister');

function runDemo() {
  const catalog = new Catalog();
  // Populate catalog with sample products
  catalog.addProduct(new Product({ id: '001', name: 'Café', price: 7.5, stock: 100 }));
  catalog.addProduct(new Product({ id: '002', name: 'Pão de Queijo', price: 5.0, stock: 50 }));
  catalog.addProduct(new Product({ id: '003', name: 'Suco de Laranja', price: 4.25, stock: 30 }));

  // Sale process
  const sale = new Sale(catalog);
  sale.addItemById('001', 2);
  sale.addItemById('002', 3);
  sale.addItemById('003', 1);
  console.log('Itens da venda:');
  sale.items.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.product.name} x ${item.quantity} = R$ ${item.subtotal.toFixed(2)}`);
  });
  console.log(`Total: R$ ${sale.total.toFixed(2)}`);
  const receipt = sale.finalize(50, 'dinheiro');
  console.log('Venda finalizada:', receipt);

  // Cash register process
  const cashRegister = new CashRegister();
  cashRegister.open(100, 'operador1');
  cashRegister.supply(50, 'operador1', 'reforço de caixa');
  cashRegister.withdrawal(30, 'operador1', 'sangria para depósito');
  const resumo = cashRegister.close();
  console.log('Resumo do caixa:', resumo);
}

if (require.main === module) {
  runDemo();
}