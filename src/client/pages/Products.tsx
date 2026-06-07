import { useState, useEffect, useCallback } from "react";
import { api, type Product, type ProductsResponse } from "../api.ts";
import ProductCard from "../components/ProductCard.tsx";

export default function Products() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
  }, []);

  const search = useCallback(async (q: string, p: number, cat: string) => {
    setLoading(true);
    try {
      const result = await api.searchProducts(q, p, 20, cat);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search(query, page, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search triggers on page/category change, not on every keystroke
  }, [page, category, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    search(query, 1, category);
  }

  async function handleAddToWatchlist(product: Product) {
    try {
      await api.addToWatchlist(product.id);
      setAdded(product.id);
      setTimeout(() => setAdded(null), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="border rounded px-2 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700"
        >
          Search
        </button>
      </form>

      {added && <p className="text-sm text-green-600">Added to watchlist!</p>}

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          <p className="text-sm text-gray-500">
            {data.total} products found (page {data.page}/{data.totalPages})
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {data.products.map((p: Product) => (
              <ProductCard key={p.id} product={p} onAddToWatchlist={handleAddToWatchlist} />
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex gap-2 justify-center">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-30"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                {page} / {data.totalPages}
              </span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
