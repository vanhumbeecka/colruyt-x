import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({
  default: { batch: vi.fn() },
}));

import { getLatestFileName, downloadProducts } from "./import-products.js";
import { productToArgs } from "./import-products.js";

const GCS_BUCKET = "colruyt-products";
const GCS_PREFIX = "colruyt-products/";

describe("import-products", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getLatestFileName", () => {
    it("uses the current year in the GCS listing URL", async () => {
      const currentYear = new Date().getFullYear();
      const expectedPrefix = `${GCS_PREFIX}${currentYear}`;
      const expectedUrl = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o?prefix=${expectedPrefix}&maxResults=100`;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [{ name: `${GCS_PREFIX}${currentYear}-01-15` }],
          }),
        ),
      );

      await getLatestFileName();

      expect(fetchSpy).toHaveBeenCalledWith(expectedUrl);
    });

    it("returns the latest file sorted alphabetically", async () => {
      const year = new Date().getFullYear();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              { name: `${GCS_PREFIX}${year}-01-01` },
              { name: `${GCS_PREFIX}${year}-03-15` },
              { name: `${GCS_PREFIX}${year}-02-10` },
            ],
          }),
        ),
      );

      const result = await getLatestFileName();
      expect(result).toBe(`${GCS_PREFIX}${year}-03-15`);
    });

    it("throws when no files are found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [] })));

      await expect(getLatestFileName()).rejects.toThrow("No product files found in GCS bucket");
    });
  });

  describe("downloadProducts", () => {
    it("fetches and returns products from the given file path", async () => {
      const products = [{ productId: "1", name: "Test" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(products)));

      const result = await downloadProducts("colruyt-products/2026-01-15");
      expect(result).toEqual(products);
    });

    it("throws on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not found", { status: 404 }));

      await expect(downloadProducts("colruyt-products/bad-file")).rejects.toThrow(
        "Failed to download: 404",
      );
    });
  });
});

describe("productToArgs", () => {
  it("maps quantityPriceQuantity into the args", () => {
    const now = "2026-06-07T00:00:00.000Z";
    const args = productToArgs(
      {
        productId: "p1",
        name: "Appel Jonagold",
        LongName: "Appel Jonagold 1kg",
        ShortName: "Appel",
        brand: "Boni",
        content: "1kg",
        thumbNail: "t.jpg",
        squareImage: "s.jpg",
        fullImage: "f.jpg",
        price: {
          basicPrice: 1.89,
          measurementUnit: "K",
          measurementUnitPrice: 1.89,
          quantityPrice: 1.74,
          quantityPriceQuantity: 3,
        },
        topCategoryId: "c1",
        topCategoryName: "Fruit",
        CountryOfOrigin: "BE",
        IsBio: false,
        inPromo: false,
        isAvailable: true,
      },
      now,
    );
    // column order: ... price(9), unit_price(10), measurement_unit(11),
    // quantity_price(12), quantity_price_quantity(13) ...
    expect(args[12]).toBe(1.74);
    expect(args[13]).toBe(3);
  });

  it("maps null quantityPriceQuantity when absent", () => {
    const args = productToArgs(
      {
        productId: "p2",
        name: "Bread",
        LongName: "Bread",
        ShortName: "Bread",
        brand: "",
        content: "",
        thumbNail: "",
        squareImage: "",
        fullImage: "",
        price: {
          basicPrice: 2,
          measurementUnit: "ST",
          measurementUnitPrice: 2,
          quantityPrice: 0,
        } as never,
        topCategoryId: "",
        topCategoryName: "",
        CountryOfOrigin: "",
        IsBio: false,
        inPromo: false,
        isAvailable: true,
      },
      "2026-06-07T00:00:00.000Z",
    );
    expect(args[13]).toBeNull();
  });
});
