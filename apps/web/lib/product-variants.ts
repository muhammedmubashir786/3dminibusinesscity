// Helpers for product variants on the product detail page. Pure and
// server-safe: no React, no browser APIs, no Supabase client.
//
// Data model (see supabase/migrations/20260916093456_categories_products.sql):
//   - product_variants: sku, storage, ram, color, model, price (no sale_price)
//   - inventory: one row per variant (variant_id) with a quantity. Stock does
//     NOT live on product_variants.
// A variant with no inventory row has unknown availability. It is never
// guessed from products.stock_status.

/** Embedded inventory row as selected from product_variants. */
export type VariantInventory = { quantity: number };

/** The columns the product page selects for each variant. */
export type ProductVariantData = {
  id: string;
  sku: string;
  storage: string | null;
  ram: string | null;
  color: string | null;
  model: string | null;
  price: number;
  // The generated types mark inventory -> product_variants as one-to-many, so
  // PostgREST returns an array. A single object or null is tolerated too.
  inventory: VariantInventory[] | VariantInventory | null | undefined;
};

export type Availability = "in_stock" | "out_of_stock" | "not_listed";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The variant id to select from the ?variant= query value, or null.
 * Accepts only a single UUID string that belongs to this product's variants;
 * anything else (missing, repeated parameter, malformed, another product's
 * variant) means "no selection".
 */
export function selectedVariantId(
  raw: string | string[] | undefined,
  variants: ReadonlyArray<{ id: string }>
): string | null {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) return null;
  const wanted = raw.toLowerCase();
  const match = variants.find((variant) => variant.id.toLowerCase() === wanted);
  return match ? match.id : null;
}

/** Variants in display order: price ascending, then SKU. Input is not mutated. */
export function sortedVariants<T extends { price: number; sku: string }>(
  variants: ReadonlyArray<T> | null | undefined
): T[] {
  if (!variants) return [];
  return [...variants].sort((a, b) => {
    const byPrice = Number(a.price) - Number(b.price);
    if (byPrice !== 0 && Number.isFinite(byPrice)) return byPrice;
    return a.sku.localeCompare(b.sku);
  });
}

/**
 * Lowest variant price, and whether every variant has that same price (in
 * which case the page shows a plain price instead of "From ₹X"). Null when
 * there is no usable price.
 */
export function priceSummary(
  variants: ReadonlyArray<{ price: number }>
): { lowest: number; allSame: boolean } | null {
  const prices = variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price));
  if (prices.length === 0) return null;
  const lowest = Math.min(...prices);
  return { lowest, allSame: prices.every((price) => price === lowest) };
}

/**
 * Availability of one variant from its embedded inventory:
 *   no row            -> "not_listed" (never falls back to product stock_status)
 *   quantity > 0      -> "in_stock"
 *   quantity 0        -> "out_of_stock"
 * A unique index allows at most one inventory row per variant; if more ever
 * arrive, the first is used.
 */
export function variantAvailability(
  inventory: ProductVariantData["inventory"]
): Availability {
  if (inventory === null || inventory === undefined) return "not_listed";
  const row = Array.isArray(inventory) ? inventory[0] : inventory;
  if (!row) return "not_listed";
  const quantity = Number(row.quantity);
  if (!Number.isFinite(quantity)) return "not_listed";
  return quantity > 0 ? "in_stock" : "out_of_stock";
}

/**
 * Availability shown before any variant is selected:
 *   any variant in stock                 -> "in_stock"
 *   every variant listed with quantity 0 -> "out_of_stock"
 *   otherwise (some not listed)          -> "not_listed"
 */
export function combinedAvailability(
  variants: ReadonlyArray<Pick<ProductVariantData, "inventory">>
): Availability {
  const states = variants.map((variant) =>
    variantAvailability(variant.inventory)
  );
  if (states.some((state) => state === "in_stock")) return "in_stock";
  if (states.length > 0 && states.every((state) => state === "out_of_stock")) {
    return "out_of_stock";
  }
  return "not_listed";
}

export function availabilityLabel(availability: Availability): string {
  if (availability === "in_stock") return "In stock";
  if (availability === "out_of_stock") return "Out of stock";
  return "Availability not listed";
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * "Storage 256GB · RAM 8GB · Color Black · Model X", using only the non-empty
 * fields, or the SKU when none are set. The prefixes keep "256GB" and "8GB"
 * from being confused.
 */
export function variantLabel(
  variant: Pick<ProductVariantData, "sku" | "storage" | "ram" | "color" | "model">
): string {
  const parts: string[] = [];
  if (clean(variant.storage)) parts.push(`Storage ${clean(variant.storage)}`);
  if (clean(variant.ram)) parts.push(`RAM ${clean(variant.ram)}`);
  if (clean(variant.color)) parts.push(`Color ${clean(variant.color)}`);
  if (clean(variant.model)) parts.push(`Model ${clean(variant.model)}`);
  return parts.length > 0 ? parts.join(" · ") : variant.sku;
}

/**
 * Product specification keys (lower-case) that the variants already control,
 * so the page can hide the duplicate rows. "ram" is hidden when at least one
 * variant has a RAM value, "storage" likewise.
 */
export function hiddenSpecKeys(
  variants: ReadonlyArray<Pick<ProductVariantData, "ram" | "storage">>
): Set<string> {
  const hidden = new Set<string>();
  if (variants.some((variant) => clean(variant.ram))) hidden.add("ram");
  if (variants.some((variant) => clean(variant.storage))) hidden.add("storage");
  return hidden;
}
