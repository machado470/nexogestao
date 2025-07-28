import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase'; // ajuste o caminho se for diferente

interface Produto {
  id: number;
  nome: string;
  preco: number;
}

export default function ProductList() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const fetchProdutos = async () => {
      const { data, error } = await supabase.from('produtos').select('*');

      if (error) {
        console.error('Erro ao buscar produtos:', error.message);
      } else {
        setProdutos(data || []);
      }

      setCarregando(false);
    };

    fetchProdutos();
  }, []);

  if (carregando) {
    return <p>Carregando produtos...</p>;
  }

  if (produtos.length === 0) {
    return <p>Nenhum produto cadastrado.</p>;
  }

  return (
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
  );
}
