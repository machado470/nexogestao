import { el, $, clear } from '../utils/dom.js';
import { Clients } from '../services/client.service.js';
import { notify } from '../utils/notify.js';

export function ViewClientes(){
  const root = el('div',{className:'Panel'});
  const form = el('form',{className:'row', onsubmit:e=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if(!data.nome?.trim()){ notify('Nome é obrigatório', true); return; }
    Clients.create(data); e.target.reset(); draw();
    notify('Cliente criado');
  }},
    el('div',{className:'col'}, el('label',{},'Nome'),  el('input',{name:'nome', className:'input', required:true})),
    el('div',{className:'col'}, el('label',{},'Email'), el('input',{name:'email', type:'email', className:'input'})),
    el('div',{className:'col'}, el('label',{},'Telefone'), el('input',{name:'telefone', className:'input'})),
    el('div',{className:'col', style:'align-self:end'}, el('button',{className:'btn primary'},'Adicionar'))
  );

  const table = el('table',{className:'table'});
  function draw(){
    clear(table);
    table.append(
      el('thead',{}, el('tr',{}, ['Nome','Email','Telefone','Ações'].map(h=> el('th',{},h)) )),
      el('tbody',{}, 
        ...Clients.all().map(c=> el('tr',{},[
          el('td',{}, c.nome),
          el('td',{}, c.email||'—'),
          el('td',{}, c.telefone||'—'),
          el('td',{}, 
            el('button',{className:'btn small', onclick:()=> edit(c.id)},'Editar'),
            ' ',
            el('button',{className:'btn small danger', onclick:()=> { Clients.remove(c.id); draw(); notify('Removido'); }},'Excluir')
          )
        ]))
      )
    );
  }
  function edit(id){
    const c = Clients.get(id);
    if(!c) return;
    const nome = prompt('Nome', c.nome); if(nome==null) return;
    const email = prompt('Email', c.email||'') ?? '';
    const tel = prompt('Telefone', c.telefone||'') ?? '';
    Clients.update(id, { nome, email, telefone:tel }); draw(); notify('Atualizado');
  }

  draw();
  return el('div',{}, el('h2',{},'Clientes'), form, el('div',{style:'height:10px'}), table);
}
