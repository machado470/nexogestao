import { el } from '../utils/dom.js';
import { KPI } from '../services/kpi.service.js';

export function ViewRelatorios(){
  const cards = KPI.cards();
  return el('div',{className:'Panel'},
    el('h2',{},'Relatórios'),
    el('div',{className:'KPI'},
      ...cards.map(c=> el('div',{className:'card'}, el('div',{className:'n'}, String(c.n)), el('div',{}, c.label)))
    )
  );
}
