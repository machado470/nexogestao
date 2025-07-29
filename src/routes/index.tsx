import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PDVMain from '../components/PDV/PDVMain';
import { Auth } from '../pages/Auth';
import PDVMain from '../components/PDV/PDVMain';
import { Dashboard } from '../pages/Dashboard';
import PDVMain from '../components/PDV/PDVMain';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/pdv" element={<PDVMain />} />
        <Route path="/" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
