import React, { useState, useEffect } from 'react';
import { Search, Barcode, Package } from 'lucide-react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

interface ProductSearchProps {
  onProductSelect: (product: Product) => void;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onProductSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchProducts = async () => {
      if (searchTerm.length >= 2) {
        setLoading(true);
        try {
          const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`)
            .limit(10);

          if (!error && products) {
            setFilteredProducts(products);
            setShowResults(true);
          }
        } catch (error) {
          console.error('Error searching products:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setFilteredProducts([]);
        setShowResults(false);
      }
    };

    const debounceTimer = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleProductClick = (product: Product) => {
    onProductSelect(product);
    setSearchTerm('');
    setShowResults(false);
  };

  return (
    <div className="relative">
      <Input
        placeholder="Buscar produto por nome, código ou código de barras..."
        value={searchTerm}
        onChange={setSearchTerm}
        icon={Search}
        className="mb-4"
      />

      {showResults && (
        <Card className="absolute top-full left-0 right-0 z-10 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              Buscando produtos...
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="space-y-2">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer rounded-lg border border-gray-100 dark:border-gray-600 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Package className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{product.name}</span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Código: {product.code} | Estoque: {product.stock}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      R$ {product.price.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{product.category}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              Nenhum produto encontrado
            </div>
          )}
        </Card>
      )}
    </div>
  );
};