import { el } from '../utils/dom.js';
import { Stock } from '../services/stock.service.js';

export function ViewEstoque(){
  const r = Stock.resumo();
  return el('div',{className:'Panel'},
    el('h2',{},'Estoque'),
    el('div',{className:'KPI'}, 
      el('div',{className:'card'}, el('div',{className:'n'}, String(r.totalProdutos)), el('div',{},'Produtos')),
      el('div',{className:'card'}, el('div',{className:'n'}, String(r.totalItens)), el('div',{},'Itens')),
      el('div',{className:'card'}, el('div',{className:'n'}, String(r.baixo.length)), el('div',{},'Baixo estoque (<5)')),
    ),
    el('h3',{},'Produtos com baixo estoque'),
    r.baixo.length? el('table',{className:'table'},
      el('thead',{}, el('tr',{}, ['SKU','Nome','Qtd'].map(h=> el('th',{},h)) )),
      el('tbody',{}, ...r.baixo.map(p=> el('tr',{},[el('td',{},p.sku||'—'), el('td',{},p.nome), el('td',{},String(p.estoque||0))])))
    ) : el('div',{},'Tudo ok 🚀')
  );
}
