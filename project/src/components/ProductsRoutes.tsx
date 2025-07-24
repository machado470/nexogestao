import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';

export const ProductsRoutes: React.FC = () => (
  <Routes>
    <Route path="" element={<ProductList />} />
    <Route path="new" element={<ProductForm />} />
    <Route path=":id/edit" element={<ProductForm />} />
    <Route path="*" element={<Navigate to="" />} />
  </Routes>
);
