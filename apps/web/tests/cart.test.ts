// Unit tests for client cart pure helpers in apps/web/lib/cart.ts
// Run with `pnpm --filter web test` (or `pnpm test` at repo root).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineKey,
  isValidUuid,
  parseStoredCart,
  serializeCart,
  addItem,
  updateQuantity,
  removeItem,
  countTotalItems,
  calculateLineTotal,
  calculateSubtotal,
  MAX_LINES,
  MAX_QTY_PER_LINE,
  type CartItem,
} from "../lib/cart.ts";

const P1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const P2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const V1 = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const V2 = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";

// --- 1. lineKey & UUID validation ------------------------------------------

test("lineKey: lowercases and handles null or undefined variantId", () => {
  assert.equal(lineKey(P1, null), `${P1}:default`);
  assert.equal(lineKey(P1, undefined), `${P1}:default`);
  assert.equal(lineKey(P1.toUpperCase(), V1.toUpperCase()), `${P1}:${V1}`);
});

test("isValidUuid: validates standard UUIDs and rejects garbage", () => {
  assert.equal(isValidUuid(P1), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
  assert.equal(isValidUuid(123), false);
});

// --- 2. parseStoredCart ----------------------------------------------------

test("parseStoredCart: returns empty cart on null, undefined, or empty string", () => {
  assert.deepEqual(parseStoredCart(null), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart(undefined), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart(""), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart("   "), { version: 1, items: [] });
});

test("parseStoredCart: handles corrupt JSON without throwing", () => {
  assert.deepEqual(parseStoredCart("{not json"), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart("123"), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart("true"), { version: 1, items: [] });
  assert.deepEqual(parseStoredCart("[]"), { version: 1, items: [] });
});

test("parseStoredCart: rejects wrong schema version or missing items array", () => {
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 2, items: [] })), {
    version: 1,
    items: [],
  });
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 1 })), {
    version: 1,
    items: [],
  });
});

test("parseStoredCart: drops items with invalid product IDs or variant IDs", () => {
  const input = JSON.stringify({
    version: 1,
    items: [
      { productId: "bad-id", variantId: null, quantity: 2 },
      { productId: P1, variantId: "bad-variant", quantity: 2 },
      { productId: P1, variantId: null, quantity: 2 },
      { productId: P2, variantId: V1, quantity: 3 },
    ],
  });
  const cart = parseStoredCart(input);
  assert.equal(cart.items.length, 2);
  assert.equal(cart.items[0]?.productId, P1);
  assert.equal(cart.items[1]?.productId, P2);
});

test("parseStoredCart: drops items with non-positive, NaN, fractional, or non-integer quantities", () => {
  const input = JSON.stringify({
    version: 1,
    items: [
      { productId: P1, variantId: null, quantity: 0 },
      { productId: P1, variantId: null, quantity: -2 },
      { productId: P1, variantId: null, quantity: 1.5 },
      { productId: P1, variantId: null, quantity: "2" },
      { productId: P1, variantId: null, quantity: Number.NaN },
      { productId: P1, variantId: null, quantity: Number.POSITIVE_INFINITY },
      { productId: P2, variantId: null, quantity: 3 },
    ],
  });
  const cart = parseStoredCart(input);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0]?.productId, P2);
  assert.equal(cart.items[0]?.quantity, 3);
});

test("parseStoredCart: clamps excessive quantities and deduplicates duplicate keys", () => {
  const input = JSON.stringify({
    version: 1,
    items: [
      { productId: P1, variantId: null, quantity: 999 },
      { productId: P1, variantId: null, quantity: 2 },
    ],
  });
  const cart = parseStoredCart(input);
  assert.equal(cart.items.length, 1);
  // Clamped to MAX_QTY_PER_LINE
  assert.equal(cart.items[0]?.quantity, MAX_QTY_PER_LINE);
});

test("parseStoredCart: caps total lines at MAX_LINES", () => {
  const items: unknown[] = [];
  for (let i = 0; i < 70; i++) {
    // Generate valid distinct UUIDs
    const hex = i.toString(16).padStart(8, "0");
    const id = `${hex}-0000-0000-0000-000000000000`;
    items.push({ productId: id, variantId: null, quantity: 1 });
  }
  const cart = parseStoredCart(JSON.stringify({ version: 1, items }));
  assert.equal(cart.items.length, MAX_LINES);
});

// --- 3. serializeCart ------------------------------------------------------

test("serializeCart: serializes only productId, variantId, and quantity", () => {
  const cart = {
    version: 1 as const,
    items: [{ productId: P1, variantId: V1, quantity: 4 }],
  };
  const json = serializeCart(cart);
  const reParsed = JSON.parse(json);
  assert.deepEqual(reParsed, {
    version: 1,
    items: [{ productId: P1, variantId: V1, quantity: 4 }],
  });
});

// --- 4. addItem ------------------------------------------------------------

test("addItem: adds a new item to cart", () => {
  const initial: CartItem[] = [];
  const next = addItem(initial, { productId: P1, variantId: null, quantity: 1 });
  assert.equal(next.length, 1);
  assert.equal(next[0]?.productId, P1);
  assert.equal(next[0]?.variantId, null);
  assert.equal(next[0]?.quantity, 1);
});

test("addItem: increments existing item with matching productId and variantId", () => {
  const initial: CartItem[] = [
    { productId: P1, variantId: null, quantity: 2 },
  ];
  const next = addItem(initial, { productId: P1, variantId: null, quantity: 3 });
  assert.equal(next.length, 1);
  assert.equal(next[0]?.quantity, 5);
});

test("addItem: separates lines when variantIds differ", () => {
  const initial: CartItem[] = [
    { productId: P1, variantId: null, quantity: 1 },
  ];
  const next = addItem(initial, { productId: P1, variantId: V1, quantity: 1 });
  assert.equal(next.length, 2);
  assert.equal(next[0]?.variantId, null);
  assert.equal(next[1]?.variantId, V1);
});

test("addItem: respects maxStock constraint and MAX_QTY_PER_LINE ceiling", () => {
  const initial: CartItem[] = [
    { productId: P1, variantId: null, quantity: 4 },
  ];
  // With maxStock = 5, adding 3 clamps to 5
  const clamped = addItem(initial, { productId: P1, variantId: null, quantity: 3 }, 5);
  assert.equal(clamped[0]?.quantity, 5);

  // Without maxStock, adding up to 10 is clamped at MAX_QTY_PER_LINE
  const maxClamped = addItem(initial, { productId: P1, variantId: null, quantity: 20 });
  assert.equal(maxClamped[0]?.quantity, MAX_QTY_PER_LINE);
});

test("addItem: does not exceed MAX_LINES", () => {
  const full: CartItem[] = [];
  for (let i = 0; i < MAX_LINES; i++) {
    const hex = i.toString(16).padStart(8, "0");
    full.push({ productId: `${hex}-0000-0000-0000-000000000000`, variantId: null, quantity: 1 });
  }
  const next = addItem(full, { productId: P1, variantId: null, quantity: 1 });
  assert.equal(next.length, MAX_LINES);
});

// --- 5. updateQuantity -----------------------------------------------------

test("updateQuantity: updates item quantity clamped to bounds", () => {
  const initial: CartItem[] = [{ productId: P1, variantId: null, quantity: 2 }];
  const next = updateQuantity(initial, P1, null, 7);
  assert.equal(next[0]?.quantity, 7);

  const clamped = updateQuantity(initial, P1, null, 15);
  assert.equal(clamped[0]?.quantity, MAX_QTY_PER_LINE);
});

test("updateQuantity: decrementing to 0 or negative removes the line", () => {
  const initial: CartItem[] = [
    { productId: P1, variantId: null, quantity: 2 },
    { productId: P2, variantId: null, quantity: 1 },
  ];
  const zero = updateQuantity(initial, P1, null, 0);
  assert.equal(zero.length, 1);
  assert.equal(zero[0]?.productId, P2);

  const negative = updateQuantity(initial, P2, null, -1);
  assert.equal(negative.length, 1);
  assert.equal(negative[0]?.productId, P1);
});

test("updateQuantity: respects maxStock limit", () => {
  const initial: CartItem[] = [{ productId: P1, variantId: null, quantity: 2 }];
  const limited = updateQuantity(initial, P1, null, 8, 4);
  assert.equal(limited[0]?.quantity, 4);
});

// --- 6. removeItem ---------------------------------------------------------

test("removeItem: removes the targeted item only", () => {
  const initial: CartItem[] = [
    { productId: P1, variantId: null, quantity: 1 },
    { productId: P1, variantId: V1, quantity: 2 },
  ];
  const removed = removeItem(initial, P1, null);
  assert.equal(removed.length, 1);
  assert.equal(removed[0]?.variantId, V1);
});

// --- 7. countTotalItems, calculateLineTotal, calculateSubtotal -------------

test("countTotalItems: sums quantities across all lines", () => {
  const items: CartItem[] = [
    { productId: P1, variantId: null, quantity: 2 },
    { productId: P2, variantId: V1, quantity: 3 },
  ];
  assert.equal(countTotalItems(items), 5);
  assert.equal(countTotalItems([]), 0);
});

test("calculateLineTotal: multiplies price by quantity with 2-decimal rounding", () => {
  assert.equal(calculateLineTotal(54999, 2), 109998);
  assert.equal(calculateLineTotal(99.99, 3), 299.97);
  assert.equal(calculateLineTotal(10.5, 0), 0);
  assert.equal(calculateLineTotal(-10, 2), 0);
});

test("calculateSubtotal: sums only available lines and handles decimal precision", () => {
  const lines = [
    { lineTotal: 109998, isAvailable: true },
    { lineTotal: 4999.5, isAvailable: true },
    { lineTotal: 999, isAvailable: false }, // out of stock / unavailable
  ];
  assert.equal(calculateSubtotal(lines), 114997.5);
  assert.equal(calculateSubtotal([]), 0);
});
