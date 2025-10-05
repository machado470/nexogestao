import { el } from '../utils/dom.js';

export function Header(){
  return el('div',{className:'Header'},
    el('div',{className:'brand'},
      el('img',{src:'/public/assets/logo.svg', alt:'Logo'}),
      el('strong',{},'NexoGestão')
    ),
    el('div',{className:'search'},
      el('input',{type:'search', placeholder:'Buscar (tecla /)', onkeydown:e=>{
        if(e.key === 'Escape') e.target.value='';
      }})
    )
  );
}
