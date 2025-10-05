// client.service.js — CRUD de clientes (offline-first)
import { storage } from '../utils/storage.js';

const KEY = 'clients';

const uid = () => crypto.randomUUID?.() || ('id_' + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();

function load(){ return storage.get(KEY, []); }
function save(list){ storage.set(KEY, list); return list; }

export const clientService = {
  list(){ return load().sort((a,b)=> (a.name||'').localeCompare(b.name||'')); },

  get(id){ return load().find(c => c.id === id) || null; },

  search(q){
    q = (q||'').trim().toLowerCase();
    if (!q) return this.list();
    return load().filter(c =>
      [c.name, c.doc, c.email, c.phone]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  },

  create(data){
    const c = {
      id: uid(),
      name: data.name?.trim() || 'Sem nome',
      doc: data.doc || '',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      createdAt: now(),
      updatedAt: now(),
      notes: data.notes || ''
    };
    const list = load();
    list.push(c);
    save(list);
    return c;
  },

  update(id, patch){
    const list = load();
    const i = list.findIndex(c => c.id === id);
    if (i < 0) throw new Error('Cliente não encontrado');
    list[i] = { ...list[i], ...patch, updatedAt: now() };
    save(list);
    return list[i];
  },

  remove(id){
    const list = load().filter(c => c.id !== id);
    save(list);
    return true;
  }
};import { storage, uid } from '../utils/storage.js';
const KEY = 'clients';

export const Clients = {
  all(){ return storage.get(KEY, []); },
  get(id){ return this.all().find(x=>x.id===id); },
  create(data){
    const item = { id: uid(), nome: '', email:'', telefone:'', ativo:true, createdAt:Date.now(), ...data };
    storage.push(KEY, item); return item;
  },
  update(id, patch){
    const item = { ...this.get(id), ...patch }; storage.put(KEY, id, item); return item;
  },
  remove(id){ storage.del(KEY, id); }
};
