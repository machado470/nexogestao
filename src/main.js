// Boot + roteador simples + layout
import { $, el, clear } from './utils/dom.js';
import { notify } from './utils/notify.js';
import { applyTheme } from './themes/theme.js';

// Views
import { Header } from './ui/header.ui.js';
import { Sidebar } from './ui/sidebar.ui.js';
import { ViewClientes } from './ui/clients.ui.js';
import { ViewProdutos } from './ui/produtos.ui.js';
import { ViewEstoque } from './ui/estoque.ui.js';
import { ViewRelatorios } from './ui/relatorios.ui.js';
import { ViewPDV } from './ui/pdv.ui.js';
import { ViewNFE } from './ui/nfe.ui.js';
import { ViewSuporte } from './ui/suporte.ui.js';

// Seeds mínimos na 1ª execução
import { storage } from './utils/storage.js';
import { Clients } from './services/client.service.js';
import { Products } from './services/product.service.js';

function seedOnce(){
  if(storage.get('seeded')) return;
  Clients.create({ nome:'Acme LTDA', email:'contato@acme.com', telefone:'(11) 9999-0000' });
  Clients.create({ nome:'Padaria do Zé', email:'ze@padaria.com' });
  Products.create({ sku:'SKU-001', nome:'Teclado Mecânico', preco:349.90, estoque:8 });
  Products.create({ sku:'SKU-002', nome:'Mouse Gamer', preco:149.90, estoque:3 });
  storage.set('seeded', true);
}

const routes = {
  '#/':        () => dashboard(),
  '#/clientes':    () => ViewClientes(),
  '#/produtos':    () => ViewProdutos(),
  '#/estoque':     () => ViewEstoque(),
  '#/relatorios':  () => ViewRelatorios(),
  '#/pdv':         () => ViewPDV(),
  '#/nfe':         () => ViewNFE(),
  '#/suporte':     () => ViewSuporte(),
};

function dashboard(){
  const box = el('div',{className:'Panel'}, el('h2',{},'Bem-vindo ao NexoGestão'),
    el('p',{},'Use o menu ao lado para navegar. Já deixei clientes e produtos de exemplo.')
  );
  return box;
}

function mountLayout(){
  const app = $('#app'); clear(app);
  const layout = el('div',{className:'Layout'},
    Header(),
    Sidebar(),
    el('main',{className:'Main', id:'main'})
  );
  app.append(layout);
}

function render(){
  const out = $('#main'); clear(out);
  const hash = location.hash || '#/';
  const view = routes[hash] || dashboard;
  out.append(view());
}

(function boot(){
  applyTheme();
  seedOnce();
  mountLayout();
  addEventListener('hashchange', render);
  render();
  // UX: focar busca com "/"
  addEventListener('keydown', (e)=>{ if(e.key==='/' && !/input|textarea/i.test(document.activeElement.tagName)){ e.preventDefault(); document.querySelector('input[type="search"]')?.focus(); } });
  notify('MVP carregado 🚀');
})();
