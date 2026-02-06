import { BrowserRouter, Routes, Route, Link } from "react-router";
import Home from "./pages/Home.tsx";
import Products from "./pages/Products.tsx";
import GroceryLists from "./pages/GroceryLists.tsx";
import GroceryListDetail from "./pages/GroceryListDetail.tsx";

export default function App() {
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
            <Link
              to="/grocery-lists"
              className="text-gray-600 hover:text-gray-900"
            >
              Lists
            </Link>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/grocery-lists" element={<GroceryLists />} />
            <Route path="/grocery-lists/:id" element={<GroceryListDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
