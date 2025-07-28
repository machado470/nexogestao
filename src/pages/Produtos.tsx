import React, { useEffect, useState } from 'react';

type Produto = {
  id: number;
  nome: string;
  preco: number;
};

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [editando, setEditando] = useState<null | Produto>(null);

  const carregarProdutos = async () => {
    const res = await fetch('http://localhost:8000/produtos/listar.php');
    const data = await res.json();
    setProdutos(data);
  };

  const salvarProduto = async () => {
    const metodo = editando ? 'PUT' : 'POST';
    const url = editando
      ? 'http://localhost:8000/produtos/atualizar.php'
      : 'http://localhost:8000/produtos/criar.php';

    await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editando?.id,
        nome,
        preco,
      }),
    });

    setNome('');
    setPreco('');
    setEditando(null);
    carregarProdutos();
  };

  const excluirProduto = async (id: number) => {
    await fetch('http://localhost:8000/produtos/deletar.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    carregarProdutos();
  };

  const editarProduto = (produto: Produto) => {
    setEditando(produto);
    setNome(produto.nome);
    setPreco(produto.preco.toString());
  };

  useEffect(() => {
    carregarProdutos();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Produtos</h1>

      <input
        placeholder="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
      />
      <input
        placeholder="Preço"
        value={preco}
        type="number"
        onChange={(e) => setPreco(e.target.value)}
      />
      <button onClick={salvarProduto}>
        {editando ? 'Atualizar' : 'Cadastrar'}
      </button>

      <hr />

      <ul>
        {produtos.map((p) => (
          <li key={p.id}>
            {p.nome} - R$ {p.preco.toFixed(2)}
            <button onClick={() => editarProduto(p)}>Editar</button>
            <button onClick={() => excluirProduto(p.id)}>Excluir</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
