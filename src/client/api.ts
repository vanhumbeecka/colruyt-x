async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Product {
  id: string;
  name: string;
  long_name: string | null;
  short_name: string | null;
  brand: string | null;
  content: string | null;
  thumbnail_url: string | null;
  square_image_url: string | null;
  price: number | null;
  unit_price: number | null;
  measurement_unit: string | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
  category_name: string | null;
  is_promo: number;
  is_bio: number;
}

export interface ProductsResponse {
  products: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WatchlistItem {
  product_id: string;
  added_at: string;
  name: string;
  long_name: string | null;
  brand: string | null;
  content: string | null;
  thumbnail_url: string | null;
  full_image_url: string | null;
  price: number | null;
  unit_price: number | null;
  measurement_unit: string | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
  category_name: string | null;
  is_promo: number;
  is_bio: number;
}

export interface Deal {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

// Mirrors the server's computeDeal: a volume deal is a positive per-item price
// below the basic price with a "buy N" quantity present.
export function getDeal(p: {
  price: number | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
}): Deal | null {
  if (
    p.price == null ||
    p.quantity_price == null ||
    p.quantity_price_quantity == null ||
    p.quantity_price <= 0 ||
    p.quantity_price >= p.price ||
    p.quantity_price_quantity <= 0
  ) {
    return null;
  }
  return {
    quantity: p.quantity_price_quantity,
    unitPrice: p.quantity_price,
    discountPct: (p.price - p.quantity_price) / p.price,
  };
}

export const api = {
  // Auth
  login: (pin: string) =>
    apiFetch<{ ok: boolean; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),

  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  checkAuth: () => apiFetch<{ authenticated: boolean }>("/api/auth/check"),

  // Watchlist
  getWatchlist: () => apiFetch<WatchlistItem[]>("/api/watchlist"),

  addToWatchlist: (productId: string) =>
    apiFetch<{ ok: boolean }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ productId }),
    }),

  removeFromWatchlist: (productId: string) =>
    apiFetch<{ ok: boolean }>(`/api/watchlist/${productId}`, { method: "DELETE" }),

  // Products
  searchProducts: (q: string, page = 1, limit = 20, category = "") =>
    apiFetch<ProductsResponse>(
      `/api/products?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&category=${encodeURIComponent(category)}`,
    ),

  getProduct: (id: string) => apiFetch<Product>(`/api/products/${id}`),

  getCategories: () => apiFetch<string[]>("/api/products/categories"),
};
