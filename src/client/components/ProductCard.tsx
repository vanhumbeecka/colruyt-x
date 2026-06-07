import { getDeal, formatDeal, type Product } from "../api.ts";

export default function ProductCard({
  product,
  onAddToWatchlist,
}: {
  product: Product;
  onAddToWatchlist?: (product: Product) => void;
}) {
  const deal = getDeal(product);
  return (
    <div className="bg-white rounded-lg shadow-sm border p-3 flex gap-3">
      {product.thumbnail_url && (
        <img
          src={product.thumbnail_url}
          alt={product.name}
          className="w-16 h-16 object-contain shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">
          {product.long_name || product.name}
        </p>
        <p className="text-xs text-gray-500">
          {product.brand} {product.content && `· ${product.content}`}
        </p>
        <div className="flex items-baseline gap-2 mt-1">
          {product.price != null && (
            <span className="text-sm font-semibold text-orange-600">
              {"€"}
              {product.price.toFixed(2)}
            </span>
          )}
          {product.unit_price != null && product.measurement_unit && (
            <span className="text-xs text-gray-400">
              {"€"}
              {product.unit_price.toFixed(2)}/
              {product.measurement_unit === "K"
                ? "kg"
                : product.measurement_unit === "L"
                  ? "L"
                  : product.measurement_unit}
            </span>
          )}
          {product.is_promo === 1 && (
            <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Promo</span>
          )}
          {deal && (
            <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
              {formatDeal(deal)}
            </span>
          )}
        </div>
      </div>
      {onAddToWatchlist && (
        <button
          onClick={() => onAddToWatchlist(product)}
          className="self-center text-orange-600 hover:text-orange-700 text-lg shrink-0"
          title="Add to list"
        >
          +
        </button>
      )}
    </div>
  );
}
