/*
 * Product.js
 *
 * Define a simple Product class for the PDV system.
 * Each product has a unique id, a name, a price and an
 * optional stock quantity. Other modules can import this
 * class to model items in the catalog.
 */

class Product {
  constructor({ id, name, price, stock = 0 }) {
    this.id = id;
    this.name = name;
    this.price = price;
    this.stock = stock;
  }
}

module.exports = Product;
