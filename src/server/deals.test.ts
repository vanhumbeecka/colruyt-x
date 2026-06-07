import { describe, it, expect } from "vitest";
import { detectDeals, type WatchedProduct, type DealState } from "./deals.js";

function product(over: Partial<WatchedProduct> = {}): WatchedProduct {
  return {
    productId: "p1",
    name: "Appel Jonagold",
    price: 1.89,
    quantityPrice: 1.74,
    quantityPriceQuantity: 3,
    imageUrl: "f.jpg",
    ...over,
  };
}

function state(over: Partial<DealState> = {}): DealState {
  return { productId: "p1", onDeal: true, quantity: 3, unitPrice: 1.74, ...over };
}

describe("detectDeals", () => {
  it("emits onset when a product enters a deal (no prior state)", () => {
    const events = detectDeals([product()], new Map());
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("onset");
    expect(events[0].productId).toBe("p1");
    expect(events[0].basicPrice).toBe(1.89);
    expect(events[0].quantity).toBe(3);
    expect(events[0].unitPrice).toBe(1.74);
    expect(events[0].discountPct).toBeCloseTo(0.0794, 3);
    expect(events[0].imageUrl).toBe("f.jpg");
  });

  it("emits onset when prior state was not on a deal", () => {
    const prior = new Map([["p1", state({ onDeal: false, quantity: null, unitPrice: null })]]);
    const events = detectDeals([product()], prior);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("onset");
  });

  it("emits improved when the per-item price decreases", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.8 })]]);
    const events = detectDeals([product({ quantityPrice: 1.74 })], prior);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("improved");
    expect(events[0].unitPrice).toBe(1.74);
  });

  it("emits nothing when deal terms are unchanged", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.74 })]]);
    expect(detectDeals([product({ quantityPrice: 1.74 })], prior)).toHaveLength(0);
  });

  it("emits nothing when the per-item price gets worse", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.6 })]]);
    expect(detectDeals([product({ quantityPrice: 1.74 })], prior)).toHaveLength(0);
  });

  it("emits nothing when an existing deal disappears", () => {
    const prior = new Map([["p1", state()]]);
    const gone = product({ quantityPrice: null, quantityPriceQuantity: null });
    expect(detectDeals([gone], prior)).toHaveLength(0);
  });

  it("emits nothing when quantity is missing", () => {
    const noQty = product({ quantityPriceQuantity: null });
    expect(detectDeals([noQty], new Map())).toHaveLength(0);
  });

  it("emits nothing when the product never had a deal (no quantityPrice)", () => {
    const noDeal = product({ quantityPrice: null, quantityPriceQuantity: null });
    expect(detectDeals([noDeal], new Map())).toHaveLength(0);
  });

  it("emits nothing when quantityPrice is not below price", () => {
    const noDeal = product({ quantityPrice: 1.89 });
    expect(detectDeals([noDeal], new Map())).toHaveLength(0);
  });
});
