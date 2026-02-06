import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { api, type GroceryList } from "../api.ts";

export default function GroceryLists() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getGroceryLists()
      .then(setLists)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const list = await api.createGroceryList({ name: newName.trim(), items: [] });
    setNewName("");
    navigate(`/grocery-lists/${list.id}`);
  }

  async function handleDelete(id: string) {
    await api.deleteGroceryList(id);
    setLists(lists.filter((l) => l.id !== id));
  }

  function parseItems(itemsJson: string) {
    try {
      const items = JSON.parse(itemsJson);
      const total = items.length;
      const checked = items.filter((i: { checked: boolean }) => i.checked).length;
      return { total, checked };
    } catch {
      return { total: 0, checked: 0 };
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Grocery Lists</h1>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list name..."
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700"
        >
          Create
        </button>
      </form>

      {lists.length === 0 && (
        <p className="text-gray-500">No lists yet. Create one above.</p>
      )}

      <div className="space-y-2">
        {lists.map((list) => {
          const { total, checked } = parseItems(list.items);
          return (
            <div
              key={list.id}
              className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between"
            >
              <Link
                to={`/grocery-lists/${list.id}`}
                className="flex-1 min-w-0"
              >
                <p className="font-medium text-gray-900">{list.name}</p>
                <p className="text-xs text-gray-500">
                  {total} items{total > 0 && ` (${checked}/${total} checked)`}
                  {" · "}
                  {new Date(list.updated_at).toLocaleDateString("nl-BE")}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(list.id)}
                className="text-red-500 hover:text-red-700 text-sm ml-4"
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
