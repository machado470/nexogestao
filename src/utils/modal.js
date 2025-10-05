// Modal leve (apenas 1 aberto por vez)
import { el, $ } from './dom.js';

let openRef = null;

export function openModal({ title='Info', content='', actions=[] }){
  closeModal();
  const overlay = el('div', { class:'modal-overlay', role:'dialog', 'aria-modal':'true' }, [
    el('div', { class:'modal' }, [
      el('div', { class:'modal-hd' }, [ title ]),
      el('div', { class:'modal-bd' }, [ content ]),
      el('div', { class:'modal-ft' }, actions.length ? actions : [
        el('button', { class:'btn', onclick: closeModal }, 'Fechar')
      ])
    ])
  ]);
  document.body.append(overlay);
  openRef = overlay;
}

export function closeModal(){
  if (openRef) { openRef.remove(); openRef = null; }
}

export const modal = { open: openModal, close: closeModal };
