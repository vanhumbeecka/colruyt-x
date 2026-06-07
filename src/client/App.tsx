import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import { api } from "./api.ts";
import Login from "./pages/Login.tsx";
import Watchlist from "./pages/Watchlist.tsx";
import Products from "./pages/Products.tsx";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .checkAuth()
      .then((r) => setAuthed(r.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  async function handleLogout() {
    await api.logout();
    setAuthed(false);
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-5xl mx-auto px-4 py-3 flex gap-6 items-center">
            <Link to="/" className="font-bold text-lg text-orange-600">
              Colruyt-X
            </Link>
            <Link to="/products" className="text-gray-600 hover:text-gray-900">
              Products
            </Link>
            <button
              onClick={handleLogout}
              className="ml-auto text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Watchlist />} />
            <Route path="/products" element={<Products />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
