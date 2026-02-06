import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { api, type GroceryList, type GroceryListItem } from "../api.ts";

export default function GroceryListDetail() {
  const { id } = useParams<{ id: string }>();
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .getGroceryList(id)
      .then((l) => {
        setList(l);
        setItems(JSON.parse(l.items));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const save = useCallback(
    async (updatedItems: GroceryListItem[]) => {
      if (!id) return;
      await api.updateGroceryList(id, { items: updatedItems });
    },
    [id]
  );

  function toggleItem(index: number) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    );
    setItems(updated);
    save(updated);
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    save(updated);
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const newItem: GroceryListItem = {
      name: newItemName.trim(),
      amount: newItemAmount.trim() || "1",
      unit: "",
      checked: false,
    };
    const updated = [...items, newItem];
    setItems(updated);
    save(updated);
    setNewItemName("");
    setNewItemAmount("");
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!list) return <p className="text-red-500">List not found.</p>;

  const checkedCount = items.filter((i) => i.checked).length;
  const totalPrice = items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/grocery-lists" className="text-gray-500 hover:text-gray-700">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold">{list.name}</h1>
      </div>

      <p className="text-sm text-gray-500">
        {checkedCount}/{items.length} items checked
        {totalPrice > 0 && (
          <span>
            {" · Estimated: \u20AC"}
            {totalPrice.toFixed(2)}
          </span>
        )}
      </p>

      <form onSubmit={addItem} className="flex gap-2">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add item..."
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={newItemAmount}
          onChange={(e) => setNewItemAmount(e.target.value)}
          placeholder="Qty"
          className="w-16 border rounded px-2 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700"
        >
          Add
        </button>
      </form>

      <div className="space-y-1">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 bg-white rounded border p-3 ${
              item.checked ? "opacity-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => toggleItem(i)}
              className="w-4 h-4 accent-orange-600"
            />
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${item.checked ? "line-through text-gray-400" : "text-gray-900"}`}
              >
                {item.name}
              </span>
              {item.amount && (
                <span className="text-xs text-gray-500 ml-2">
                  {item.amount}
                  {item.unit && ` ${item.unit}`}
                </span>
              )}
            </div>
            {item.price != null && item.price > 0 && (
              <span className="text-xs text-gray-500">
                {"\u20AC"}{item.price.toFixed(2)}
              </span>
            )}
            <button
              onClick={() => removeItem(i)}
              className="text-gray-400 hover:text-red-500 text-sm"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          Empty list. Add items above or use Claude to generate a grocery list via the API.
        </p>
      )}
    </div>
  );
}
