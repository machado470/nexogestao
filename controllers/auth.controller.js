export const login = (req, res) => {
  res.status(200).json({ message: 'Login realizado com sucesso!' });
};

export const logout = (req, res) => {
  res.status(200).json({ message: 'Logout realizado com sucesso!' });
};
