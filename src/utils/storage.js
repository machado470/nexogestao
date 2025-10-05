const NS = 'nexogestao:';
const readJSON = (k, def) => {
  try { return JSON.parse(localStorage.getItem(NS+k)) ?? def; } catch { return def; }
};
const writeJSON = (k, v) => localStorage.setItem(NS+k, JSON.stringify(v));
export const storage = {
  get: readJSON,
  set: writeJSON,
  push(k, item){ const arr = readJSON(k, []); arr.push(item); writeJSON(k, arr); return item; },
  put(k, id, data){ const arr = readJSON(k, []); const i = arr.findIndex(x=>x.id===id); if(i>-1){arr[i]=data; writeJSON(k, arr);} return data; },
  del(k, id){ const arr = readJSON(k, []); writeJSON(k, arr.filter(x=>x.id!==id)); },
  clearAll(){ Object.keys(localStorage).filter(k=>k.startsWith(NS)).forEach(k=>localStorage.removeItem(k)); }
};
export const uid = ()=> Math.random().toString(36).slice(2,9);
