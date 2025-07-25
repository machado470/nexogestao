export const api = {
  get: async (url: string) => {
    const res = await fetch(url);
    return res.json();
  }
};

