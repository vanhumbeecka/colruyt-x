import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api, type GroceryListItem } from "../api.ts";

export default function Home() {
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [notes, setNotes] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    try {
      const list = await api.getList();
      setItems(JSON.parse(list.items));
      setNotes(list.notes || "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function save(updatedItems: GroceryListItem[]) {
    setItems(updatedItems);
    await api.updateList({ items: updatedItems });
  }

  function toggleItem(index: number) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item,
    );
    save(updated);
  }

  function removeItem(index: number) {
    save(items.filter((_, i) => i !== index));
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
    save([...items, newItem]);
    setNewItemName("");
    setNewItemAmount("");
  }

  async function handleClearChecked() {
    const result = await api.clearChecked();
    setItems(JSON.parse(result.items));
  }

  async function handleReset() {
    if (!confirm("Clear all items and notes?")) return;
    const result = await api.resetList();
    setItems(JSON.parse(result.items));
    setNotes("");
  }

  async function handleNotesBlur() {
    await api.updateList({ notes });
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const checkedCount = items.filter((i) => i.checked).length;
  const totalPrice = items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grocery List</h1>
        <Link to="/products" className="text-sm text-orange-600 hover:text-orange-700">
          + Add from Products
        </Link>
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
                {"\u20AC"}
                {item.price.toFixed(2)}
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
          Empty list. Add items above or browse products.
        </p>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="Notes..."
        className="w-full border rounded px-3 py-2 text-sm min-h-[60px]"
      />

      <div className="flex gap-2">
        {checkedCount > 0 && (
          <button
            onClick={handleClearChecked}
            className="text-sm text-gray-600 hover:text-gray-900 border rounded px-3 py-1"
          >
            Clear checked ({checkedCount})
          </button>
        )}
        {items.length > 0 && (
          <button
            onClick={handleReset}
            className="text-sm text-red-500 hover:text-red-700 border rounded px-3 py-1"
          >
            Reset list
          </button>
        )}
      </div>
    </div>
  );
}
