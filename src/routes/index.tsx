import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from '../pages/Auth';
import Painel from '../pages/Painel'; // ajuste conforme seu projeto

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/painel" element={<Painel />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
