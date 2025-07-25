/*
 * demo_pdv.cjs
 *
 * Script de demonstração para o módulo PDV usando arquivos CommonJS (.cjs).
 * Este script importa as classes Product, Catalog, Sale e CashRegister do
 * diretório src/services/pdv e executa uma venda de exemplo com operações
 * de caixa. Execute com `node scripts/demo_pdv.cjs` após copiar para a pasta scripts.
 */

const Product = require('../src/services/pdv/Product.cjs');
const Catalog = require('../src/services/pdv/Catalog.cjs');
const Sale = require('../src/services/pdv/Sale.cjs');
const CashRegister = require('../src/services/pdv/CashRegister.cjs');

function runDemo() {
  const catalog = new Catalog();
  // Adiciona produtos de exemplo
  catalog.addProduct(new Product({ id: '001', name: 'Café', price: 7.5, stock: 100 }));
  catalog.addProduct(new Product({ id: '002', name: 'Pão de Queijo', price: 5.0, stock: 50 }));
  catalog.addProduct(new Product({ id: '003', name: 'Suco de Laranja', price: 4.25, stock: 30 }));

  // Processo de venda
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

  // Processo de caixa
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