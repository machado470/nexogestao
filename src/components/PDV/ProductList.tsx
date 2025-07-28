import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';

interface Produto {
  id: number;
  nome: string;
  preco: number;
}

export default function ProductList() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');

  const fetchProdutos = async () => {
    const { data, error } = await supabase.from('produtos').select('*');
    if (error) {
      console.error('Erro ao buscar produtos:', error.message);
    } else {
      setProdutos(data || []);
    }
    setCarregando(false);
  };

  const adicionarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !preco) return;

    const precoNumerico = parseFloat(preco.replace(',', '.'));
    const { error } = await supabase.from('produtos').insert([{ nome, preco: precoNumerico }]);

    if (error) {
      console.error('Erro ao cadastrar produto:', error.message);
    } else {
      setNome('');
      setPreco('');
      fetchProdutos(); // Atualiza lista
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  if (carregando) return <p>Carregando produtos...</p>;

  return (
    <>
      <h2>Cadastrar Produto</h2>
      <form onSubmit={adicionarProduto} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Preço (ex: 9.99)"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          required
        />
        <button type="submit">Salvar</button>
      </form>

      {produtos.length === 0 ? (
        <p>Nenhum produto cadastrado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Preço</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((produto) => (
              <tr key={produto.id}>
                <td>{produto.nome}</td>
                <td>R$ {produto.preco.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
