import React from 'react';
import Cart from './Cart';
import ProductList from './ProductList';
import PaymentPanel from './PaymentPanel';

const PDVMain = () => {
  return (
    <div className='flex flex-col p-4 gap-4'>
      <h1 className='text-2xl font-bold'>PDV - NexoGestão</h1>
      <ProductList />
      <Cart />
      <PaymentPanel />
    </div>
  );
};

export default PDVMain;
