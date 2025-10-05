import { el, clear } from '../utils/dom.js';
import { Products } from '../services/product.service.js';
import { notify } from '../utils/notify.js';

export function ViewProdutos(){
  const root = el('div',{className:'Panel'});
  const form = el('form',{className:'row', onsubmit:e=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if(!data.nome?.trim()) return notify('Nome é obrigatório', true);
    data.preco = Number(data.preco||0);
    data.estoque = Number(data.estoque||0);
    Products.create(data); e.target.reset(); draw(); notify('Produto criado');
  }},
    el('div',{className:'col'}, el('label',{},'SKU'),     el('input',{name:'sku', className:'input'})),
    el('div',{className:'col'}, el('label',{},'Nome'),    el('input',{name:'nome', className:'input', required:true})),
    el('div',{className:'col'}, el('label',{},'Preço'),   el('input',{name:'preco', className:'input', type:'number', step:'0.01'})),
    el('div',{className:'col'}, el('label',{},'Estoque'), el('input',{name:'estoque', className:'input', type:'number'})),
    el('div',{className:'col', style:'align-self:end'}, el('button',{className:'btn primary'},'Adicionar'))
  );

  const table = el('table',{className:'table'});
  function draw(){
    clear(table);
    table.append(
      el('thead',{}, el('tr',{}, ['SKU','Nome','Preço','Estoque','Ações'].map(h=> el('th',{},h)) )),
      el('tbody',{}, 
        ...Products.all().map(p=> el('tr',{},[
          el('td',{}, p.sku || '—'),
          el('td',{}, p.nome),
          el('td',{}, `R$ ${Number(p.preco||0).toFixed(2)}`),
          el('td',{}, String(p.estoque||0)),
          el('td',{}, 
            el('button',{className:'btn small', onclick:()=> edit(p.id)},'Editar'),
            ' ',
            el('button',{className:'btn small danger', onclick:()=> { Products.remove(p.id); draw(); notify('Removido'); }},'Excluir')
          )
        ]))
      )
    );
  }
  function edit(id){
    const p = Products.get(id); if(!p) return;
    const sku = prompt('SKU', p.sku||'') ?? '';
    const nome = prompt('Nome', p.nome) ?? p.nome;
    const preco = Number(prompt('Preço', String(p.preco||0)) ?? p.preco);
    const est = Number(prompt('Estoque', String(p.estoque||0)) ?? p.estoque);
    Products.update(id, { sku, nome, preco, estoque: est }); draw(); notify('Atualizado');
  }

  draw();
  return el('div',{}, el('h2',{},'Produtos'), form, el('div',{style:'height:10px'}), table);
}
