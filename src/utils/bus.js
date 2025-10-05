const map = new Map();
export const bus = {
  on(type, fn){ (map.get(type) ?? map.set(type, new Set()).get(type)).add(fn); return ()=> map.get(type)?.delete(fn); },
  emit(type, payload){ map.get(type)?.forEach(fn=>fn(payload)); }
};
