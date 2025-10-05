// invoice.service.js — emissão NF-e (mock) vinculada à venda
import { storage } from '../utils/storage.js';
import { saleService } from './sale.service.js';

const KEY = 'invoices';

const uid = () => crypto.randomUUID?.() || ('id_' + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const seqKey = 'invoices.seq';

function load(){ return storage.get(KEY, []); }
function save(list){ storage.set(KEY, list); return list; }
function nextNumber(){
  const n = Number(storage.get(seqKey, 0)) + 1;
  storage.set(seqKey, n);
  return String(n).padStart(9, '0');
}

export const invoiceService = {
  list(){ return load().sort((a,b)=> b.ts.localeCompare(a.ts)); },

  get(id){ return load().find(i => i.id === id) || null; },

  issueFromSale(saleId){
    const sale = saleService.get(saleId);
    if (!sale) throw new Error('Venda não encontrada');
    const inv = {
      id: uid(),
      ts: now(),
      number: nextNumber(),
      saleId: sale.id,
      clientId: sale.clientId || null,
      total: sale.total,
      status: 'authorized', // mock: sempre autoriza
      xml: `<xml mock="true" nfe="${Math.random().toString(36).slice(2)}"/>`
    };
    const list = load(); list.push(inv); save(list);
    return inv;
  },

  cancel(id, reason='Cancelamento manual'){
    const list = load();
    const i = list.findIndex(n => n.id === id);
    if (i < 0) throw new Error('NF não encontrada');
    list[i].status = 'canceled';
    list[i].cancelReason = reason;
    list[i].updatedAt = now();
    save(list);
    return list[i];
  }
};
