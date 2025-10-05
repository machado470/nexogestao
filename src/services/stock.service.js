import { Products } from './product.service.js';
export const Stock = {
  resumo(){ 
    const ps = Products.all();
    const totalItens = ps.reduce((a,p)=>a + Number(p.estoque||0),0);
    const baixo = ps.filter(p=> (p.estoque??0) < 5);
    return { totalProdutos: ps.length, totalItens, baixo };
  }
};
