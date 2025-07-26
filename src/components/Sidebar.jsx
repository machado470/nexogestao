import { Link } from 'react-router-dom';

function Sidebar() {
  return (
    <aside className="bg-gray-200 w-48 p-4">
      <nav className="flex flex-col space-y-2">
        <Link to="/dashboard" className="text-blue-600 hover:underline">
          Dashboard
        </Link>
        <Link to="/caixa" className="text-blue-600 hover:underline">
          Caixa
        </Link>
        <Link to="/login" className="text-blue-600 hover:underline">
          Login
        </Link>
      </nav>
    </aside>
  );
}

export default Sidebar;
