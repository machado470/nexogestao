/*
 * Sale.js
 *
 * The Sale class represents a shopping cart or sale session.
 * It holds references to the catalog, a collection of items
 * and provides methods to add items, calculate totals and
 * finalize payments.
 */

const SaleItem = require('./SaleItem.cjs');

class Sale {
  constructor(catalog) {
    this.catalog = catalog;
    this.items = [];
    this.closed = false;
  }

  /**
   * Adds a product by id and quantity to the sale. Reduces
   * stock in the catalog. Throws if stock is insufficient or
   * if the sale is already closed.
   * @param {string} id
   * @param {number} quantity
   */
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
    product.stock -= quantity;
    const item = new SaleItem(product, quantity);
    this.items.push(item);
    return item;
  }

  // Calculates the total cost of the sale
  get total() {
    return this.items.reduce((sum, item) => sum + item.subtotal, 0);
  }

  /**
   * Finalizes the sale given a payment amount and method. Marks
   * the sale as closed and returns a summary including change.
   * @param {number} paymentAmount
   * @param {string} paymentMethod
   */
  finalize(paymentAmount, paymentMethod = 'dinheiro') {
    if (this.closed) {
      throw new Error('Venda já foi finalizada.');
    }
    const total = this.total;
    if (paymentAmount < total) {
      throw new Error(`Valor pago insuficiente. Total é R$ ${total.toFixed(2)}.`);
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

module.exports = Sale;