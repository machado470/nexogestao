import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Product } from '../types';

export const ProductForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (isEdit) {
      supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            setName(data.name);
            setBarcode(data.barcode || '');
            setPrice(data.price.toString());
            setStock(data.stock.toString());
          }
        });
    }
  }, [isEdit, id]);

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Nome é obrigatório');
    if (!barcode.trim()) errs.push('Código de barras é obrigatório');
    if (!price || parseFloat(price) <= 0) errs.push('Valor deve ser maior que 0');
    if (stock === '' || parseInt(stock) < 0) errs.push('Estoque inválido');
    setErrors(errs);
    return errs.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data = {
      name,
      barcode,
      code: barcode,
      price: parseFloat(price),
      stock: parseInt(stock),
      category: 'Geral'
    } as Omit<Product, 'id' | 'created_at' | 'is_active'>;

    if (isEdit) {
      await supabase.from('products').update(data).eq('id', id);
    } else {
      await supabase.from('products').insert(data);
    }

    navigate('/products');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {isEdit ? 'Editar Produto' : 'Novo Produto'}
      </h1>

      <Card>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input label="Nome" value={name} onChange={setName} required />
          <Input label="Código de Barras" value={barcode} onChange={setBarcode} required />
          <Input label="Valor (R$)" value={price} onChange={setPrice} type="number" required />
          <Input label="Estoque" value={stock} onChange={setStock} type="number" required />

          {errors.length > 0 && (
            <div className="text-red-600 text-sm space-y-1">
              {errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/products')}>Cancelar</Button>
            <Button type="submit" variant="success">Salvar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
