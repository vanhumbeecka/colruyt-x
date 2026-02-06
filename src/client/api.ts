const API_KEY = import.meta.env.VITE_API_KEY || "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
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

export interface GroceryListItem {
  name: string;
  amount: string;
  unit: string;
  category?: string;
  checked: boolean;
  productId?: string;
  price?: number;
}

export interface GroceryList {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  items: string;
  notes: string | null;
}

export const api = {
  searchProducts: (q: string, page = 1, limit = 20, category = "") =>
    apiFetch<ProductsResponse>(
      `/api/products?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&category=${encodeURIComponent(category)}`
    ),

  getProduct: (id: string) => apiFetch<Product>(`/api/products/${id}`),

  getCategories: () => apiFetch<string[]>("/api/products/categories"),

  getGroceryLists: () => apiFetch<GroceryList[]>("/api/grocery-lists"),

  getGroceryList: (id: string) => apiFetch<GroceryList>(`/api/grocery-lists/${id}`),

  createGroceryList: (data: { name: string; items: GroceryListItem[]; notes?: string }) =>
    apiFetch<GroceryList>("/api/grocery-lists", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGroceryList: (id: string, data: Partial<{ name: string; items: GroceryListItem[]; notes: string }>) =>
    apiFetch<GroceryList>(`/api/grocery-lists/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteGroceryList: (id: string) =>
    apiFetch<void>(`/api/grocery-lists/${id}`, { method: "DELETE" }),
};
