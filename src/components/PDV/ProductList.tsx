import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';

interface Produto {
  id: number;
  nome: string;
  preco: number;
}

export default function ProductList() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProdutos = async () => {
      const { data, error } = await supabase.from('produtos').select('*');
      if (error) {
        console.error('Erro ao buscar produtos:', error);
      } else {
        setProdutos(data as Produto[]);
      }
      setLoading(false);
    };

    fetchProdutos();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Produtos</h2>
      {loading ? (
        <p>Carregando...</p>
      ) : produtos.length === 0 ? (
        <p className="text-gray-500">Nenhum produto cadastrado.</p>
      ) : (
        <table className="min-w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2 border-b">Nome</th>
              <th className="text-left p-2 border-b">Preço</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((produto) => (
              <tr key={produto.id}>
                <td className="p-2 border-b">{produto.nome}</td>
                <td className="p-2 border-b">R$ {produto.preco.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
