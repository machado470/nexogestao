/*
 * Catalog.js
 *
 * The Catalog keeps a collection of products in memory and
 * provides methods to add and retrieve products by id. In a
 * production environment this would interface with a database.
 */

const Product = require('./Product.cjs');

class Catalog {
  constructor() {
    this.products = new Map();
  }

  /**
   * Adds a product to the catalog. If a product with the same id
   * already exists, it will be overwritten.
   * @param {Product} product
   */
  addProduct(product) {
    if (!(product instanceof Product)) {
      throw new TypeError('Argument must be an instance of Product');
    }
    this.products.set(product.id, product);
  }

  /**
   * Retrieves a product by its id.
   * @param {string} id
   * @returns {Product|null}
   */
  getProductById(id) {
    return this.products.get(id) || null;
  }
}

module.exports = Catalog;