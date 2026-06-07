export interface WatchedProduct {
  productId: string;
  name: string;
  price: number | null;
  quantityPrice: number | null;
  quantityPriceQuantity: number | null;
  imageUrl: string | null;
}

export interface DealState {
  productId: string;
  onDeal: boolean;
  quantity: number | null;
  unitPrice: number | null;
}

export type DealKind = "onset" | "improved";

export interface DealEvent {
  productId: string;
  name: string;
  basicPrice: number;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  imageUrl: string | null;
  kind: DealKind;
}

export interface ProductDeal {
  onDeal: boolean;
  quantity: number | null;
  unitPrice: number | null;
}

// A product is on a volume deal when quantityPrice is a positive per-item price
// below the basic price and a quantity ("buy N") is present.
export function computeDeal(p: WatchedProduct): ProductDeal {
  const onDeal =
    p.price != null &&
    p.quantityPrice != null &&
    p.quantityPrice > 0 &&
    p.quantityPrice < p.price &&
    p.quantityPriceQuantity != null &&
    p.quantityPriceQuantity > 0;
  return {
    onDeal,
    quantity: onDeal ? p.quantityPriceQuantity : null,
    unitPrice: onDeal ? p.quantityPrice : null,
  };
}

export function detectDeals(
  watched: WatchedProduct[],
  priorState: Map<string, DealState>,
): DealEvent[] {
  const events: DealEvent[] = [];
  for (const p of watched) {
    const deal = computeDeal(p);
    if (!deal.onDeal) continue;

    const prior = priorState.get(p.productId);
    const onset = !prior || !prior.onDeal;
    const improved = !onset && prior.unitPrice != null && deal.unitPrice! < prior.unitPrice;

    if (!onset && !improved) continue;

    events.push({
      productId: p.productId,
      name: p.name,
      basicPrice: p.price!,
      quantity: deal.quantity!,
      unitPrice: deal.unitPrice!,
      discountPct: (p.price! - p.quantityPrice!) / p.price!,
      imageUrl: p.imageUrl,
      kind: onset ? "onset" : "improved",
    });
  }
  return events;
}
