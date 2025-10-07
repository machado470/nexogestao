// client.service.js - CRUD de clientes consumindo API
const API_URL = 'http://localhost:3001/api/clients';

export const clientService = {
  async list() {
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
  async update(id, data) {
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },
  async remove(id) {
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE'
    });
    return res.ok;
  },
  async search(q) {
    q = (q || '').trim().toLowerCase();
    const list = await this.list();
    if (!q) return list;
    return list.filter(c => {
      return [c.name, c.doc, c.email, c.phone]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }
};
