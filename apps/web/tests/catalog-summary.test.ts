// Tests for the catalog pricing/availability helpers in lib/product-variants.
// Run with `pnpm --filter web test` (or `pnpm test` at the repo root). They use
// Node's built-in test runner and native TypeScript support, so no extra
// dependency is needed. They cover the pure helpers only: no database, no
// browser. The source-guard tests at the bottom read the page files as text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  availabilityLabel,
  catalogSummary,
  combinedAvailability,
  discountInfo,
  priceSummary,
  type CatalogVariant,
} from "../lib/product-variants.ts";

type ProductInput = Parameters<typeof catalogSummary>[0];

const IN_STOCK = { quantity: 5 };
const OUT_OF_STOCK = { quantity: 0 };

function variant(
  price: CatalogVariant["price"],
  inventory: CatalogVariant["inventory"]
): CatalogVariant {
  return { price, inventory };
}

function product(extra: Partial<ProductInput> = {}): ProductInput {
  return { price: 1000, sale_price: null, ...extra };
}

// --- 1. Product without variants -------------------------------------------

test("no variants: keeps products.price and product-level stock (availability null)", () => {
  const expected = {
    price: { kind: "single", price: 1000, discount: null },
    availability: null,
  };
  assert.deepEqual(catalogSummary(product()), expected);
  assert.deepEqual(catalogSummary(product({ product_variants: undefined })), expected);
  assert.deepEqual(catalogSummary(product({ product_variants: null })), expected);
  assert.deepEqual(catalogSummary(product({ product_variants: [] })), expected);
});

test("no variants: a valid sale_price keeps its sale presentation", () => {
  const summary = catalogSummary(product({ price: 1000, sale_price: 800 }));
  assert.deepEqual(summary.price, {
    kind: "single",
    price: 1000,
    discount: { salePrice: 800, savings: 200, percent: 20 },
  });
  assert.equal(summary.availability, null);
});

test("no variants: sale_price of 0, equal to, or above the price is not a sale", () => {
  for (const salePrice of [0, 1000, 1200]) {
    const summary = catalogSummary(product({ price: 1000, sale_price: salePrice }));
    assert.deepEqual(summary.price, { kind: "single", price: 1000, discount: null });
  }
});

// --- 2 & 3. Variant pricing ------------------------------------------------

test("variants with equal prices: plain price, no From", () => {
  const summary = catalogSummary(
    product({
      product_variants: [variant(500, IN_STOCK), variant("500", IN_STOCK)],
    })
  );
  assert.deepEqual(summary.price, { kind: "variants", amount: 500, from: false });
});

test("variants with different prices: From the lowest, whatever the order", () => {
  const variants = [variant(900, IN_STOCK), variant(300, IN_STOCK), variant(600, IN_STOCK)];
  const forward = catalogSummary(product({ product_variants: variants }));
  const reversed = catalogSummary(product({ product_variants: [...variants].reverse() }));
  assert.deepEqual(forward.price, { kind: "variants", amount: 300, from: true });
  assert.deepEqual(reversed.price, forward.price);
});

test("a single variant shows its own price without From", () => {
  const summary = catalogSummary(product({ product_variants: [variant(750, IN_STOCK)] }));
  assert.deepEqual(summary.price, { kind: "variants", amount: 750, from: false });
});

// --- 4. Product-level sale_price is ignored when variants exist ------------

test("variants: product-level price and sale_price are ignored", () => {
  const summary = catalogSummary(
    product({
      price: 99999,
      sale_price: 1,
      product_variants: [variant(400, IN_STOCK), variant(450, IN_STOCK)],
    })
  );
  assert.deepEqual(summary.price, { kind: "variants", amount: 400, from: true });
});

// --- 5 to 9. Variant availability -----------------------------------------

test("all variants in stock -> in_stock (array and single-object inventory)", () => {
  const summary = catalogSummary(
    product({
      product_variants: [variant(100, [IN_STOCK]), variant(200, IN_STOCK)],
    })
  );
  assert.equal(summary.availability, "in_stock");
});

test("every variant listed with quantity 0 -> out_of_stock", () => {
  const summary = catalogSummary(
    product({
      product_variants: [variant(100, [OUT_OF_STOCK]), variant(200, OUT_OF_STOCK)],
    })
  );
  assert.equal(summary.availability, "out_of_stock");
});

test("variants with no inventory record -> not_listed", () => {
  const summary = catalogSummary(
    product({
      product_variants: [variant(100, []), variant(200, null), variant(300, undefined)],
    })
  );
  assert.equal(summary.availability, "not_listed");
});

test("mixed in-stock and unlisted variants -> in_stock", () => {
  const summary = catalogSummary(
    product({ product_variants: [variant(100, [IN_STOCK]), variant(200, [])] })
  );
  assert.equal(summary.availability, "in_stock");
});

test("out-of-stock mixed with unlisted (nothing in stock) -> not_listed", () => {
  const summary = catalogSummary(
    product({ product_variants: [variant(100, [OUT_OF_STOCK]), variant(200, [])] })
  );
  assert.equal(summary.availability, "not_listed");
});

test("variant availability never falls back to products.stock_status", () => {
  const row = {
    ...product({ product_variants: [variant(100, [OUT_OF_STOCK])] }),
    stock_status: "in_stock",
  };
  assert.equal(catalogSummary(row).availability, "out_of_stock");
  const unlisted = {
    ...product({ product_variants: [variant(100, [])] }),
    stock_status: "in_stock",
  };
  assert.equal(catalogSummary(unlisted).availability, "not_listed");
});

test("availability labels for the three states", () => {
  assert.equal(availabilityLabel("in_stock"), "In stock");
  assert.equal(availabilityLabel("out_of_stock"), "Out of stock");
  assert.equal(availabilityLabel("not_listed"), "Availability not listed");
});

// --- 9. Null / empty / malformed data -------------------------------------

test("empty variant list gives not_listed from combinedAvailability, never a crash", () => {
  assert.equal(combinedAvailability([]), "not_listed");
});

test("variants whose prices are all unusable -> unavailable price, still no crash", () => {
  const summary = catalogSummary(
    product({
      product_variants: [variant(null, [IN_STOCK]), variant("", [IN_STOCK])],
    })
  );
  assert.deepEqual(summary.price, { kind: "unavailable" });
  assert.equal(summary.availability, "in_stock");
});

test("unusable variant prices are skipped, usable ones still decide", () => {
  const summary = catalogSummary(
    product({
      product_variants: [
        variant(null, []),
        variant(-5, []),
        variant(Number.NaN, []),
        variant(Number.POSITIVE_INFINITY, []),
        variant("  ", []),
        variant(250, []),
        variant(400, []),
      ],
    })
  );
  assert.deepEqual(summary.price, { kind: "variants", amount: 250, from: true });
});

test("a malformed (null) variant entry does not crash", () => {
  const summary = catalogSummary(
    product({
      product_variants: [null as unknown as CatalogVariant, variant(100, [IN_STOCK])],
    })
  );
  assert.deepEqual(summary.price, { kind: "variants", amount: 100, from: false });
  assert.equal(summary.availability, "in_stock");
});

// --- priceSummary hardening ------------------------------------------------

test("priceSummary rejects null, empty, whitespace, negative, NaN and Infinity", () => {
  const bad: CatalogVariant["price"][] = [
    null,
    undefined,
    "",
    "   ",
    -1,
    "-3",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "abc",
  ];
  for (const price of bad) {
    assert.equal(priceSummary([{ price }]), null, `price ${String(price)}`);
  }
  assert.equal(priceSummary([]), null);
});

test("priceSummary still accepts zero, numbers and numeric strings", () => {
  assert.deepEqual(priceSummary([{ price: 0 }]), { lowest: 0, allSame: true });
  assert.deepEqual(priceSummary([{ price: "12.50" }, { price: 20 }]), {
    lowest: 12.5,
    allSame: false,
  });
});

// --- discountInfo (moved to lib, behaviour unchanged) ---------------------

test("discountInfo: valid sale, savings and percent", () => {
  assert.deepEqual(discountInfo(1000, 750), {
    salePrice: 750,
    savings: 250,
    percent: 25,
  });
});

test("discountInfo: no sale for null, undefined, 0, equal, higher or non-finite values", () => {
  assert.equal(discountInfo(1000, null), null);
  assert.equal(discountInfo(1000, undefined), null);
  assert.equal(discountInfo(1000, 0), null);
  assert.equal(discountInfo(1000, 1000), null);
  assert.equal(discountInfo(1000, 1500), null);
  assert.equal(discountInfo(1000, Number.NaN), null);
  assert.equal(discountInfo(Number.NaN, 500), null);
  assert.equal(discountInfo(Number.POSITIVE_INFINITY, 500), null);
});

test("discountInfo: percent is null when the saving rounds to 0%", () => {
  assert.deepEqual(discountInfo(10000, 9999.99), {
    salePrice: 9999.99,
    savings: 0.01,
    percent: null,
  });
});

// --- 10. Catalog and shop listing consistency ------------------------------
// These are SOURCE GUARDS, not behaviour tests: they read the page files as
// text and fail if /products or /shops/[slug] stop using the shared helper or
// reintroduce their own price/sale logic. The rendered pages themselves are
// not exercised here (that needs a browser and real variant data).

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, "..", "app");

function readPage(...segments: string[]): string {
  return readFileSync(path.join(appDir, ...segments), "utf8");
}

const listingPages = [
  { name: "/products", source: readPage("products", "page.tsx") },
  { name: "/shops/[slug]", source: readPage("shops", "[slug]", "page.tsx") },
];

for (const { name, source } of listingPages) {
  test(`source guard: ${name} uses the shared catalogSummary rules`, () => {
    assert.match(source, /catalogSummary,?\s[\s\S]*?from "(\.\.\/)+lib\/product-variants"/);
    assert.match(source, /catalogSummary\(product\)/);
    assert.match(source, /availabilityLabel\(summary\.availability\)/);
    assert.ok(
      source.includes("product_variants ( price, inventory ( quantity ) )"),
      "embeds variant price and inventory in the same products query"
    );
  });

  test(`source guard: ${name} has no page-local sale/price logic`, () => {
    assert.ok(!/product\.sale_price/.test(source), "no product.sale_price comparison");
    assert.ok(!/formatPrice\(product\.price\)/.test(source), "no direct products.price render");
    assert.ok(!/formatPrice\(product\.sale_price\)/.test(source), "no direct sale_price render");
  });
}

test("source guard: /products and /shops/[slug] select the same variant columns", () => {
  const embeds = listingPages.map(({ source }) =>
    /product_variants \( [^)]*\( [^)]*\) \)/.exec(source)?.[0]
  );
  assert.equal(embeds[0], embeds[1]);
  assert.ok(embeds[0], "variant embed present");
});

test("source guard: detail page imports discountInfo instead of defining it", () => {
  const detail = readPage("products", "[id]", "page.tsx");
  assert.match(detail, /discountInfo,?\s[\s\S]*?from "(\.\.\/)+lib\/product-variants"/);
  assert.ok(!/function discountInfo/.test(detail), "no local discountInfo");
});
