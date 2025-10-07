// product.service.js - CRUD de produtos consumindo API
const API_URL = 'http://localhost:3001/api/products';

export const Products = {
  async all() {
    const res = await fetch(API_URL);
    return await res.json();
  },
  async get(id) {
    const res = await fetch(`${API_URL}/${id}`);
    if (!res.ok) return null;
    return await res.json();
  },
  async create(data) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },
  async update(id, patch) {
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    return await res.json();
  },
  async remove(id) {
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE'
    });
    return res.ok;
  }
};
