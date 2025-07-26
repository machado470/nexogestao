/*
 * pdv_sample.js
 *
 * Este script é um protótipo inicial para o módulo PDV (frente de caixa).
 * Ele demonstra como modelar produtos, adicionar itens a uma venda,
 * calcular o total e o troco, e finalizar a venda com diferentes
 * formas de pagamento. Nenhuma dependência externa é utilizada, o
 * que permite que o código rode em ambientes restritos sem acesso à
 * internet ou ao NPM. Este é apenas um primeiro passo; em um
 * sistema completo, as classes e funções daqui serão integradas ao
 * backend (por exemplo, via Express) e a um banco de dados.
 */

// Classe que representa um produto no catálogo
class Product {
  constructor({ id, name, price, stock = 0 }) {
    this.id = id; // código ou SKU do produto
    this.name = name; // nome do produto
    this.price = price; // preço unitário
    this.stock = stock; // quantidade em estoque
  }
}

// Catálogo simples com produtos em memória
class Catalog {
  constructor() {
    this.products = new Map();
  }

  // Adiciona um produto ao catálogo
  addProduct(product) {
    this.products.set(product.id, product);
  }

  // Busca um produto pelo código (id)
  getProductById(id) {
    return this.products.get(id) || null;
  }
}

// Representa um item de venda (produto + quantidade)
class SaleItem {
  constructor(product, quantity) {
    this.product = product;
    this.quantity = quantity;
  }

  // Calcula o subtotal deste item
  get subtotal() {
    return this.product.price * this.quantity;
  }
}

// Classe de venda (carrinho)
class Sale {
  constructor(catalog) {
    this.catalog = catalog;
    this.items = [];
    this.closed = false;
  }

  // Adiciona um produto usando o código e a quantidade
  addItemById(id, quantity = 1) {
    if (this.closed) {
      throw new Error('Venda já foi finalizada.');
    }
    const product = this.catalog.getProductById(id);
    if (!product) {
      throw new Error(`Produto com código ${id} não encontrado.`);
    }
    if (product.stock < quantity) {
      throw new Error(`Estoque insuficiente para ${product.name}.`);
    }
    // Deduz a quantidade do estoque (controle simples)
    product.stock -= quantity;
    const item = new SaleItem(product, quantity);
    this.items.push(item);
    return item;
  }

  // Calcula o total da venda
  get total() {
    return this.items.reduce((sum, item) => sum + item.subtotal, 0);
  }

  // Finaliza a venda e retorna dados do pagamento
  finalize(paymentAmount, paymentMethod = 'dinheiro') {
    if (this.closed) {
      throw new Error('Venda já foi finalizada.');
    }
    const total = this.total;
    if (paymentAmount < total) {
      throw new Error(
        `Valor pago insuficiente. Total é R$ ${total.toFixed(2)}.`,
      );
    }
    const change = paymentAmount - total;
    this.closed = true;
    return {
      total,
      paymentMethod,
      paymentAmount,
      change,
    };
  }
}

// Classe que representa um caixa (frente de caixa) e registra sangrias e suprimentos
class CashRegister {
  constructor(initialAmount = 0, operator = 'sistema') {
    this.opened = false;
    this.initialAmount = initialAmount;
    this.currentAmount = 0;
    this.operator = operator;
    this.operations = [];
  }

  // Abre o caixa com um valor inicial
  open(initialAmount, operator = this.operator) {
    if (this.opened) {
      throw new Error('Caixa já está aberto.');
    }
    this.opened = true;
    this.initialAmount = initialAmount;
    this.currentAmount = initialAmount;
    this.operator = operator;
    this.operations.push({
      type: 'abertura',
      amount: initialAmount,
      operator,
      timestamp: new Date(),
    });
  }

  // Registra um suprimento (entrada de dinheiro no caixa)
  supply(amount, operator = this.operator, reason = 'suprimento') {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    if (amount <= 0) {
      throw new Error('Valor de suprimento deve ser positivo.');
    }
    this.currentAmount += amount;
    this.operations.push({
      type: 'suprimento',
      amount,
      operator,
      reason,
      timestamp: new Date(),
    });
  }

  // Registra uma sangria (retirada de dinheiro do caixa)
  withdrawal(amount, operator = this.operator, reason = 'sangria') {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    if (amount <= 0) {
      throw new Error('Valor de sangria deve ser positivo.');
    }
    if (amount > this.currentAmount) {
      throw new Error('Valor de sangria maior que o saldo em caixa.');
    }
    this.currentAmount -= amount;
    this.operations.push({
      type: 'sangria',
      amount,
      operator,
      reason,
      timestamp: new Date(),
    });
  }

  // Fecha o caixa e retorna um resumo (inclui sangrias/suprimentos)
  close(finalAmount = this.currentAmount, operator = this.operator) {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    const resumo = {
      operador: operator,
      inicial: this.initialAmount,
      final: finalAmount,
      totalOperacional: this.currentAmount,
      suprimentos: this.operations
        .filter((op) => op.type === 'suprimento')
        .reduce((s, op) => s + op.amount, 0),
      sangrias: this.operations
        .filter((op) => op.type === 'sangria')
        .reduce((s, op) => s + op.amount, 0),
      operacoes: this.operations,
    };
    // Reinicia o caixa
    this.opened = false;
    this.initialAmount = 0;
    this.currentAmount = 0;
    this.operations = [];
    return resumo;
  }
}

// Função utilitária para demonstração
function demo() {
  // Cria catálogo e adiciona produtos
  const catalog = new Catalog();
  catalog.addProduct(
    new Product({ id: '001', name: 'Café', price: 7.5, stock: 100 }),
  );
  catalog.addProduct(
    new Product({ id: '002', name: 'Pão de Queijo', price: 5.0, stock: 50 }),
  );
  catalog.addProduct(
    new Product({ id: '003', name: 'Suco de Laranja', price: 4.25, stock: 30 }),
  );

  // Inicia uma nova venda
  const sale = new Sale(catalog);
  sale.addItemById('001', 2); // 2 cafés
  sale.addItemById('002', 3); // 3 pães de queijo
  sale.addItemById('003', 1); // 1 suco

  console.log('Itens da venda:');
  sale.items.forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.product.name} x ${item.quantity} = R$ ${item.subtotal.toFixed(2)}`,
    );
  });
  console.log(`Total: R$ ${sale.total.toFixed(2)}`);

  // Finaliza a venda com pagamento em dinheiro
  const receipt = sale.finalize(50.0, 'dinheiro');
  console.log('Venda finalizada:', receipt);

  // Demonstração de operações de caixa: abertura, suprimento, sangria e fechamento
  const caixa = new CashRegister();
  caixa.open(100.0, 'operador1');
  console.log('Caixa aberto com R$100,00');
  caixa.supply(50.0, 'operador1', 'reforço de caixa');
  console.log('Suprimento de R$50,00 realizado');
  caixa.withdrawal(30.0, 'operador1', 'sangria para depósito');
  console.log('Sangria de R$30,00 realizada');
  const resumo = caixa.close();
  console.log('Caixa fechado. Resumo:', resumo);
}

// Executa o demo se este arquivo for chamado diretamente
if (require.main === module) {
  demo();
}

module.exports = {
  Product,
  Catalog,
  Sale,
  SaleItem,
  CashRegister,
};
