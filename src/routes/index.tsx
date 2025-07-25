import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from '../features/auth/Login';
import Produtos from '../features/produtos';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Login />} />
        <Route path='/produtos' element={<Produtos />} />
      </Routes>
    </BrowserRouter>
  );
}

