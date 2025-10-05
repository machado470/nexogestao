import { Clients } from './client.service.js';
import { Products } from './product.service.js';
export const KPI = {
  cards(){
    const cs = Clients.all(), ps = Products.all();
    const ativos = cs.filter(c=>c.ativo).length;
    const produtos = ps.length;
    const estoque = ps.reduce((a,p)=>a+(+p.estoque||0),0);
    return [
      { label:'Clientes ativos', n: ativos },
      { label:'Produtos', n: produtos },
      { label:'Itens em estoque', n: estoque },
    ];
  }
};
