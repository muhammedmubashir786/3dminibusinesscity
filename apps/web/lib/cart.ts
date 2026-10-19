// Pure cart data model, validation, and storage helpers for Virtual Angadi.
// Client-side cart for Phase 3.11 (localStorage only, no cookies, no DB mutations).

export const CART_STORAGE_KEY = "va_cart_v1";
export const CART_VERSION = 1;
export const MAX_LINES = 50;
export const MAX_QTY_PER_LINE = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartItem = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type StoredCart = {
  version: 1;
  items: CartItem[];
};

/**
 * Line identity key: `${productId}:${variantId ?? 'default'}`.
 * Lower-cased to guarantee case-insensitive UUID comparison.
 */
export function lineKey(productId: string, variantId?: string | null): string {
  const p = productId.trim().toLowerCase();
  const v = variantId ? variantId.trim().toLowerCase() : "default";
  return `${p}:${v}`;
}

/**
 * Validates whether a value is a valid UUID string.
 */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Strict parser for stored cart data.
 * Drops corrupt items, clamps quantities, deduplicates duplicate keys,
 * and caps total lines. Never throws on invalid JSON or bad types.
 */
export function parseStoredCart(raw: string | null | undefined): StoredCart {
  const empty: StoredCart = { version: CART_VERSION, items: [] };
  if (!raw || typeof raw !== "string") return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as { version?: unknown }).version !== CART_VERSION ||
    !Array.isArray((parsed as { items?: unknown }).items)
  ) {
    return empty;
  }

  const rawItems = (parsed as { items: unknown[] }).items;
  const validatedItems: CartItem[] = [];
  const seenKeys = new Set<string>();

  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as {
      productId?: unknown;
      variantId?: unknown;
      quantity?: unknown;
    };

    if (!isValidUuid(item.productId)) continue;

    const productId = (item.productId as string).trim().toLowerCase();

    let variantId: string | null = null;
    if (item.variantId !== null && item.variantId !== undefined) {
      if (!isValidUuid(item.variantId)) continue;
      variantId = (item.variantId as string).trim().toLowerCase();
    }

    const q = item.quantity;
    if (typeof q !== "number" || !Number.isInteger(q) || q <= 0) continue;

    const clampedQty = Math.min(q, MAX_QTY_PER_LINE);
    const key = lineKey(productId, variantId);

    if (seenKeys.has(key)) {
      // Deduplicate: merge quantity into the first occurrence if under max
      const existing = validatedItems.find(
        (i) => lineKey(i.productId, i.variantId) === key
      );
      if (existing) {
        existing.quantity = Math.min(
          existing.quantity + clampedQty,
          MAX_QTY_PER_LINE
        );
      }
      continue;
    }

    seenKeys.add(key);
    validatedItems.push({
      productId,
      variantId,
      quantity: clampedQty,
    });

    if (validatedItems.length >= MAX_LINES) break;
  }

  return {
    version: CART_VERSION,
    items: validatedItems,
  };
}

/**
 * Serializes a cart to JSON string.
 */
export function serializeCart(cart: StoredCart): string {
  return JSON.stringify({
    version: CART_VERSION,
    items: cart.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    })),
  });
}

/**
 * Adds an item to the cart or increments its quantity.
 * If maxStock is given, clamps quantity to available stock (and MAX_QTY_PER_LINE).
 */
export function addItem(
  items: ReadonlyArray<CartItem>,
  newItem: {
    productId: string;
    variantId?: string | null;
    quantity?: number;
  },
  maxStock?: number
): CartItem[] {
  if (!isValidUuid(newItem.productId)) return [...items];

  const variantId =
    newItem.variantId && isValidUuid(newItem.variantId)
      ? newItem.variantId.trim().toLowerCase()
      : null;
  const productId = newItem.productId.trim().toLowerCase();
  const key = lineKey(productId, variantId);

  const ceiling =
    typeof maxStock === "number" && maxStock >= 0
      ? Math.min(maxStock, MAX_QTY_PER_LINE)
      : MAX_QTY_PER_LINE;

  if (ceiling <= 0) return [...items];

  const addQty = Math.max(1, Math.min(newItem.quantity ?? 1, ceiling));
  const existingIndex = items.findIndex(
    (i) => lineKey(i.productId, i.variantId) === key
  );

  if (existingIndex >= 0) {
    const existing = items[existingIndex]!;
    const nextQty = Math.min(existing.quantity + addQty, ceiling);
    const updated = [...items];
    updated[existingIndex] = {
      ...existing,
      quantity: nextQty,
    };
    return updated;
  }

  if (items.length >= MAX_LINES) {
    return [...items];
  }

  return [
    ...items,
    {
      productId,
      variantId,
      quantity: addQty,
    },
  ];
}

/**
 * Updates quantity of a specific cart item.
 * If quantity <= 0, the item is removed.
 */
export function updateQuantity(
  items: ReadonlyArray<CartItem>,
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
  maxStock?: number
): CartItem[] {
  const key = lineKey(productId, variantId);
  if (quantity <= 0) {
    return items.filter((i) => lineKey(i.productId, i.variantId) !== key);
  }

  const ceiling =
    typeof maxStock === "number" && maxStock >= 0
      ? Math.min(maxStock, MAX_QTY_PER_LINE)
      : MAX_QTY_PER_LINE;

  const clamped = Math.max(1, Math.min(Math.floor(quantity), ceiling));

  return items.map((item) => {
    if (lineKey(item.productId, item.variantId) === key) {
      return { ...item, quantity: clamped };
    }
    return item;
  });
}

/**
 * Removes an item from the cart.
 */
export function removeItem(
  items: ReadonlyArray<CartItem>,
  productId: string,
  variantId?: string | null
): CartItem[] {
  const key = lineKey(productId, variantId);
  return items.filter((i) => lineKey(i.productId, i.variantId) !== key);
}

/**
 * Calculates total item count across all lines.
 */
export function countTotalItems(items: ReadonlyArray<CartItem>): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Calculates line total price in INR decimal rupees.
 */
export function calculateLineTotal(unitPrice: number, quantity: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || quantity <= 0) return 0;
  return Math.round(unitPrice * quantity * 100) / 100;
}

/**
 * Calculates subtotal for all active, available lines.
 */
export function calculateSubtotal(
  lines: ReadonlyArray<{ lineTotal: number; isAvailable: boolean }>
): number {
  const sum = lines
    .filter((line) => line.isAvailable)
    .reduce((acc, line) => acc + line.lineTotal, 0);
  return Math.round(sum * 100) / 100;
}
