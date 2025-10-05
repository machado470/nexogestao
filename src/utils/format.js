// format.js — moeda, data, porcentagem
const BRL = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const INT = new Intl.NumberFormat('pt-BR');

export const fmt = {
  money(v){ return BRL.format(Number(v||0)); },
  int(v){ return INT.format(Number(v||0)); },
  pct(v, d=1){ return `${(Number(v||0)*100).toFixed(d)}%`; },
  dateISO(d=new Date()){ return new Date(d).toISOString().slice(0,10); },
};
