import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './ui/components/Header';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 text-gray-900">
        <Header />
        <main className="p-4">
          <Routes>
            <Route path="/" element={<div>Página Inicial</div>} />
            {/* Outras rotas aqui */}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
