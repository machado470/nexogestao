import React, { useEffect, useState } from 'react';

// Tipo para os produtos
interface Produto {
  id: number;
  nome: string;
  preco: number;
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [editando, setEditando] = useState<Produto | null>(null);

  // Carrega lista inicial de produtos
  async function carregarProdutos() {
    const res = await fetch('http://localhost:8000/produtos/listar.php');
    const data = await res.json();
    setProdutos(data);
  }

  // Persiste novo produto ou atualiza existente
  async function salvarProduto() {
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
        preco: parseFloat(preco),
      }),
    });

    // Limpa campos e recarrega lista
    setNome('');
    setPreco('');
    setEditando(null);
    carregarProdutos();
  }

  // Exclui produto pelo id
  async function excluirProduto(id: number) {
    await fetch('http://localhost:8000/produtos/deletar.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    carregarProdutos();
  }

  // Preenche campos para edição
  function editarProduto(p: Produto) {
    setEditando(p);
    setNome(p.nome);
    setPreco(String(p.preco));
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Produtos</h1>
      <div className="mb-4">
        <input
          className="border rounded p-2 mr-2"
          type="text"
          placeholder="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <input
          className="border rounded p-2 mr-2"
          type="number"
          placeholder="Preço"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={salvarProduto}
        >
          {editando ? 'Atualizar' : 'Cadastrar'}
        </button>
      </div>
      <ul>
        {produtos.map((p) => (
          <li key={p.id} className="mb-2">
            {p.nome} — R$ {p.preco.toFixed(2)}
            <button
              className="ml-2 text-yellow-500"
              onClick={() => editarProduto(p)}
            >
              Editar
            </button>
            <button
              className="ml-2 text-red-500"
              onClick={() => excluirProduto(p.id)}
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
