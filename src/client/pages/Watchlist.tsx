import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api, getDeal, type WatchlistItem } from "../api.ts";

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await api.getWatchlist());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(productId: string) {
    await api.removeFromWatchlist(productId);
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <Link to="/products" className="text-sm text-orange-600 hover:text-orange-700">
          + Add from Products
        </Link>
      </div>

      {items.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          No products watched yet. Browse products to add some.
        </p>
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const deal = getDeal(item);
          return (
            <div
              key={item.product_id}
              className="flex items-center gap-3 bg-white rounded border p-3"
            >
              {item.thumbnail_url && (
                <img
                  src={item.thumbnail_url}
                  alt={item.name}
                  className="w-12 h-12 object-contain shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.long_name || item.name}
                </p>
                <div className="flex items-baseline gap-2">
                  {item.price != null && (
                    <span className="text-sm text-orange-600">
                      {"€"}
                      {item.price.toFixed(2)}
                    </span>
                  )}
                  {deal ? (
                    <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                      {`Buy ${deal.quantity}: €${deal.unitPrice.toFixed(2)} (-${Math.round(deal.discountPct * 100)}%)`}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No deal</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(item.product_id)}
                className="text-gray-400 hover:text-red-500 text-sm"
                title="Remove from watchlist"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
