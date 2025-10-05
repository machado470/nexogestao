import { el, $$ } from '../utils/dom.js';

const LINKS = [
  { href:'#/', label:'Início' },
  { href:'#/clientes', label:'Clientes' },
  { href:'#/produtos', label:'Produtos' },
  { href:'#/estoque',  label:'Estoque' },
  { href:'#/relatorios', label:'Relatórios' },
  { href:'#/pdv', label:'PDV (stub)' },
  { href:'#/nfe', label:'NFe (stub)' },
  { href:'#/suporte', label:'Suporte (stub)' },
];

export function Sidebar(){
  const nav = el('div',{className:'Sidebar'},
    el('div',{className:'group'},
      el('h4',{},'Navegação'),
      ...LINKS.map(l=> el('a',{href:l.href}, l.label))
    )
  );
  const mark = ()=> {
    const hash = location.hash || '#/';
    $$('a', nav).forEach(a=> a.classList.toggle('active', a.getAttribute('href')===hash));
  };
  addEventListener('hashchange', mark); mark();
  return nav;
}
