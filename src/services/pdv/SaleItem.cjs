/*
 * SaleItem.js
 *
 * A SaleItem represents a line in a sale: it pairs a product
 * with a quantity and provides a subtotal getter. This class
 * does not change the stock of the product; that is handled in
 * the Sale class.
 */

class SaleItem {
  constructor(product, quantity) {
    this.product = product;
    this.quantity = quantity;
  }
  // Calculates the total price for this item
  get subtotal() {
    return this.product.price * this.quantity;
  }
}

module.exports = SaleItem;
