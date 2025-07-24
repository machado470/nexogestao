import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, Trash } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');
    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      await supabase.from('products').delete().eq('id', id);
      loadProducts();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Produtos</h1>
        <Link to="new">
          <Button variant="success" size="sm" className="flex items-center">
            <Plus className="w-4 h-4 mr-2" /> Novo
          </Button>
        </Link>
      </div>

      <Card>
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Carregando...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum produto cadastrado</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Código de Barras</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Estoque</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{p.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{p.barcode}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">R$ {p.price.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{p.stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link to={`${p.id}/edit`}>
                      <Button size="sm" variant="secondary">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(p.id)}>
                      <Trash className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
