// sale.service.js — registro de vendas + integração com estoque
import { storage } from '../utils/storage.js';
import { productService } from './product.service.js';
import { stockService } from './stock.service.js';

const KEY = 'sales';

const uid = () => crypto.randomUUID?.() || ('id_' + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();

function load(){ return storage.get(KEY, []); }
function save(list){ storage.set(KEY, list); return list; }

function calcTotals(items){
  let subtotal = 0;
  for (const it of items) subtotal += Number(it.qty||0) * Number(it.price||0);
  const discount = Number(items.discount||0); // permitir embutir depois
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}

export const saleService = {
  list(){ return load().sort((a,b)=> b.ts.localeCompare(a.ts)); },

  get(id){ return load().find(s => s.id === id) || null; },

  // items: [{ sku, qty, price? }]
  create({ clientId=null, items=[], note='' }){
    // Completa preços a partir do produto se vier sem price
    const normalized = items.map(it => {
      const prod = productService.findBySKU(it.sku) || {};
      return {
        sku: it.sku,
        qty: Number(it.qty||0),
        price: Number(it.price ?? prod.price ?? 0),
        name: prod.name || it.name || it.sku
      };
    });

    const totals = calcTotals(normalized);
    const sale = {
      id: uid(),
      ts: now(),
      clientId,
      items: normalized,
      ...totals,
      note,
      status: 'closed', // simples: cria já fechada
      canceled: false
    };

    // Baixa de estoque
    for (const it of normalized) {
      if (it.qty > 0) stockService.moveOut({ sku: it.sku, qty: it.qty, note: `Venda ${sale.id}`, ref: sale.id });
    }

    const list = load(); list.push(sale); save(list);
    return sale;
  },

  cancel(id, { reason='cancelado' } = {}){
    const list = load();
    const i = list.findIndex(s => s.id === id);
    if (i < 0) throw new Error('Venda não encontrada');
    if (list[i].canceled) return list[i];

    list[i].canceled = true;
    list[i].status = 'canceled';
    list[i].cancelReason = reason;
    list[i].updatedAt = now();
    save(list);

    // Estorna estoque
    for (const it of list[i].items) {
      if (it.qty > 0) stockService.moveIn({ sku: it.sku, qty: it.qty, note:`Estorno venda ${id}`, ref:id });
    }
    return list[i];
  },

  remove(id){
    const list = load().filter(s => s.id !== id);
    save(list);
    return true;
  }
};
