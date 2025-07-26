export const productController = {
  listarTodos: () => {
    return fetch('/api/produtos').then((res) => res.json());
  },
};
