export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
export const el = (tag, props={}, children=[]) => {
  const n = Object.assign(document.createElement(tag), props);
  [].concat(children).filter(Boolean).forEach(c => n.append(c.nodeType? c : document.createTextNode(c)));
  return n;
};
export const clear = (node) => (node.innerHTML = '', node);
export const on = (node, ev, fn) => node.addEventListener(ev, fn);
export const delegate = (root, ev, sel, fn) => on(root, ev, e=>{
  const m = e.target.closest(sel); if(m && root.contains(m)) fn(e, m);
});
