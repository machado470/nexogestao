import { el } from './dom.js';
let host;
export function notify(msg, bad=false){
  host ||= document.body.appendChild(el('div',{className:'ToastHost'}));
  const box = el('div',{className:`Toast ${bad?'bad':''}`}, msg);
  host.append(box);
  setTimeout(()=> box.remove(), 3500);
}
