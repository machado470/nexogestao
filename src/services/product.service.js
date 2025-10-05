import { storage, uid } from '../utils/storage.js';
const KEY = 'products';

export const Products = {
  all(){ return storage.get(KEY, []); },
  get(id){ return this.all().find(x=>x.id===id); },
  create(data){
    const item = { id: uid(), sku:'', nome:'', preco:0, estoque:0, ativo:true, createdAt:Date.now(), ...data };
    storage.push(KEY, item); return item;
  },
  update(id, patch){ const item = { ...this.get(id), ...patch }; storage.put(KEY, id, item); return item; },
  remove(id){ storage.del(KEY, id); }
};
