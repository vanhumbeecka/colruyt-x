import { Link } from "react-router";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Colruyt-X</h1>
      <p className="text-gray-600">
        Grocery list manager powered by Colruyt product data.
      </p>
      <div className="flex gap-4">
        <Link
          to="/products"
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
        >
          Browse Products
        </Link>
        <Link
          to="/grocery-lists"
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          My Lists
        </Link>
      </div>
    </div>
  );
}
