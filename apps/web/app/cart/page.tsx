"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductImage from "../../components/ProductImage";
import { useCart } from "../../components/CartProvider";
import {
  calculateLineTotal,
  calculateSubtotal,
  lineKey,
  MAX_QTY_PER_LINE,
  type CartItem,
} from "../../lib/cart";
import {
  primaryProductImage,
  type ProductImageData,
} from "../../lib/product-images";
import {
  availabilityLabel,
  discountInfo,
  variantAvailability,
  variantLabel,
} from "../../lib/product-variants";
import { createClient } from "../../lib/supabase/client";

type CartProductVariant = {
  id: string;
  sku: string;
  storage: string | null;
  ram: string | null;
  color: string | null;
  model: string | null;
  price: number;
  inventory: { quantity: number } | { quantity: number }[] | null;
};

type CartProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  stock_status: string;
  shops: { id: string; name: string; slug: string } | null;
  product_images: ProductImageData[];
  product_variants: CartProductVariant[];
};

type ResolvedLine = {
  key: string;
  item: CartItem;
  product: CartProduct | null;
  shopId: string;
  shopName: string;
  shopSlug: string | null;
  title: string;
  variantTitle: string | null;
  href: string;
  image: ReturnType<typeof primaryProductImage>;
  unitPrice: number;
  isAvailable: boolean;
  availabilityNotice: string | null;
  maxStock: number;
  lineTotal: number;
};

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function stockLabel(status: string): string {
  switch (status) {
    case "in_stock":
      return "In stock";
    case "out_of_stock":
      return "Out of stock";
    case "discontinued":
      return "Discontinued";
    case "preorder":
      return "Pre-order";
    default:
      return status;
  }
}

export default function CartPage() {
  const { items, isLoaded, updateQuantity, removeItem, clearCart } = useCart();
  const [productsData, setProductsData] = useState<Record<string, CartProduct>>({});
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Canonical key of unique product IDs required by current cart items
  const targetIdsKey = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.productId))).sort().join(",");
  }, [items]);

  const currentIds = useMemo(() => {
    return targetIdsKey.length > 0 ? targetIdsKey.split(",") : [];
  }, [targetIdsKey]);

  // Pending if cart has items whose details have not yet been fetched from Supabase
  const pending = useMemo(() => {
    if (!isLoaded || currentIds.length === 0) return false;
    const fetchedSet = new Set(fetchedIds);
    return currentIds.some((id) => !fetchedSet.has(id));
  }, [isLoaded, currentIds, fetchedIds]);

  useEffect(() => {
    if (!isLoaded) return;
    if (currentIds.length === 0) {
      setProductsData({});
      setFetchedIds([]);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    const fetchDetails = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("products")
          .select(
            `
            id,
            name,
            slug,
            price,
            sale_price,
            stock_status,
            shops ( id, name, slug ),
            product_images ( storage_path, alt_text, position, is_primary ),
            product_variants ( id, sku, storage, ram, color, model, price, inventory ( quantity ) )
          `
          )
          .in("id", currentIds);

        if (cancelled) return;
        if (error) {
          console.error(error);
          setLoadError("Could not load product details. Please check your connection and try again.");
        } else if (data) {
          const map: Record<string, CartProduct> = {};
          for (const raw of data as unknown as CartProduct[]) {
            map[raw.id] = raw;
          }
          // Replace-on-success ensures stale or removed products are cleanly pruned
          setProductsData(map);
          setFetchedIds(currentIds);
        } else {
          // Handle the case where both error and data are null
          console.error("No data or error returned from products query");
          setLoadError("Could not load product details. Please check your connection and try again.");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        console.error(err);
        setLoadError("Could not load product details. Please check your connection and try again.");
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [targetIdsKey, currentIds, isLoaded, retryTrigger]);

  const resolvedLines: ResolvedLine[] = useMemo(() => {
    return items.map((item) => {
      const product = productsData[item.productId] ?? null;
      const key = lineKey(item.productId, item.variantId);

      if (!product) {
        return {
          key,
          item,
          product: null,
          shopId: "unavailable",
          shopName: "Unavailable items",
          shopSlug: null,
          title: "Product no longer available",
          variantTitle: null,
          href: `/products/${item.productId}`,
          image: null,
          unitPrice: 0,
          isAvailable: false,
          availabilityNotice: "This product was removed or is not available.",
          maxStock: 0,
          lineTotal: 0,
        };
      }

      const shop = product.shops;
      const shopId = shop?.id ?? "unknown";
      const shopName = shop?.name ?? "Direct / Partner Shop";
      const shopSlug = shop?.slug ?? null;
      const image = primaryProductImage(product.product_images, product.name);

      if (item.variantId) {
        const variant = product.product_variants?.find(
          (v) => v.id.toLowerCase() === item.variantId?.toLowerCase()
        );
        if (!variant) {
          return {
            key,
            item,
            product,
            shopId,
            shopName,
            shopSlug,
            title: product.name,
            variantTitle: "Selected option",
            href: `/products/${product.id}`,
            image,
            unitPrice: 0,
            isAvailable: false,
            availabilityNotice: "This option is no longer available.",
            maxStock: 0,
            lineTotal: 0,
          };
        }

        const state = variantAvailability(variant.inventory);
        const isAvailable = state === "in_stock";
        const unitPrice = Number(variant.price) || 0;
        const invRow = Array.isArray(variant.inventory)
          ? variant.inventory[0]
          : variant.inventory;
        const stockQty =
          invRow && Number.isFinite(Number(invRow.quantity))
            ? Number(invRow.quantity)
            : MAX_QTY_PER_LINE;
        const maxStock = Math.min(stockQty, MAX_QTY_PER_LINE);
        const availabilityNotice = isAvailable ? null : availabilityLabel(state);
        const lineTotal = calculateLineTotal(unitPrice, item.quantity);

        return {
          key,
          item,
          product,
          shopId,
          shopName,
          shopSlug,
          title: product.name,
          variantTitle: variantLabel(variant),
          href: `/products/${product.id}?variant=${variant.id}`,
          image,
          unitPrice,
          isAvailable,
          availabilityNotice,
          maxStock,
          lineTotal,
        };
      }

      const isAvailable = product.stock_status === "in_stock";
      const disc = discountInfo(product.price, product.sale_price);
      const unitPrice = disc ? disc.salePrice : Number(product.price) || 0;
      const maxStock = MAX_QTY_PER_LINE;
      const availabilityNotice = isAvailable
        ? null
        : stockLabel(product.stock_status) || "Out of stock";
      const lineTotal = calculateLineTotal(unitPrice, item.quantity);

      return {
        key,
        item,
        product,
        shopId,
        shopName,
        shopSlug,
        title: product.name,
        variantTitle: null,
        href: `/products/${product.id}`,
        image,
        unitPrice,
        isAvailable,
        availabilityNotice,
        maxStock,
        lineTotal,
      };
    });
  }, [items, productsData]);

  const shopGroups = useMemo(() => {
    const groups: {
      shopId: string;
      shopName: string;
      shopSlug: string | null;
      lines: ResolvedLine[];
    }[] = [];

    for (const line of resolvedLines) {
      let group = groups.find((g) => g.shopId === line.shopId);
      if (!group) {
        group = {
          shopId: line.shopId,
          shopName: line.shopName,
          shopSlug: line.shopSlug,
          lines: [],
        };
        groups.push(group);
      }
      group.lines.push(line);
    }
    return groups;
  }, [resolvedLines]);

  const subtotal = useMemo(
    () =>
      calculateSubtotal(
        resolvedLines.map((l) => ({
          lineTotal: l.lineTotal,
          isAvailable: l.isAvailable,
        }))
      ),
    [resolvedLines]
  );

  const availableCount = useMemo(
    () =>
      resolvedLines
        .filter((l) => l.isAvailable)
        .reduce((sum, l) => sum + l.item.quantity, 0),
    [resolvedLines]
  );

  const hasUnavailableItems = resolvedLines.some((l) => !l.isAvailable);

  if (!isLoaded) {
    return (
      <main className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-semibold">Shopping Cart</h1>
          <p className="text-sm text-neutral-500">Loading your cart...</p>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Shopping Cart</h1>
            <Link
              href="/products"
              className="text-sm text-neutral-600 hover:underline"
            >
              ← Back to products
            </Link>
          </div>
          <div className="border rounded-xl p-10 text-center space-y-4 bg-neutral-50/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-neutral-400"
              aria-hidden="true"
            >
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-neutral-800">
                Your cart is empty
              </h2>
              <p className="text-sm text-neutral-500">
                Looks like you haven&apos;t added any products to your cart yet.
              </p>
            </div>
            <div>
              <Link
                href="/products"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors shadow-sm"
              >
                Browse Products
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // While any cart product ID is pending initial fetch from Supabase
  if (pending) {
    if (loadError) {
      return (
        <main className="min-h-screen p-4 sm:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-semibold">Shopping Cart</h1>
            <div className="border border-red-200 bg-red-50 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-semibold text-red-800">
                Unable to load cart items
              </h2>
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => setRetryTrigger((c) => c + 1)}
                className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                Retry
              </button>
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-semibold">Shopping Cart</h1>
          <div className="border rounded-xl p-8 bg-neutral-50/50 text-center space-y-3">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800" />
            <p className="text-sm text-neutral-500">
              Checking price and availability...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Shopping Cart</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Guest cart saved to your browser
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-neutral-500 hover:text-red-600 transition-colors"
            >
              Clear cart
            </button>
            <Link
              href="/products"
              className="text-sm text-neutral-600 hover:underline"
            >
              ← Continue Shopping
            </Link>
          </div>
        </div>

        {loadError && (
          <div className="p-3 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200">
            Could not update live item status: {loadError}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
          <div className="space-y-6 lg:col-span-2">
            {shopGroups.map((group) => (
              <section
                key={group.shopId}
                className="border rounded-xl bg-white overflow-hidden shadow-sm"
              >
                <div className="border-b bg-neutral-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-800">
                      {group.shopName}
                    </span>
                    {group.shopSlug && (
                      <Link
                        href={`/shops/${group.shopSlug}`}
                        className="text-xs text-neutral-500 hover:underline"
                      >
                        (visit shop)
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {group.lines.length} {group.lines.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <ul className="divide-y divide-neutral-100">
                  {group.lines.map((line) => (
                    <li
                      key={line.key}
                      className="p-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between"
                    >
                      <div className="flex gap-4 min-w-0">
                        <div className="shrink-0">
                          <ProductImage image={line.image} variant="thumb" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={line.href}
                            className="font-medium text-sm text-neutral-900 hover:underline block break-words"
                          >
                            {line.title}
                          </Link>
                          {line.variantTitle && (
                            <p className="text-xs text-neutral-500 break-words">
                              {line.variantTitle}
                            </p>
                          )}
                          <div className="text-sm font-semibold text-neutral-900">
                            {line.isAvailable ? (
                              formatPrice(line.unitPrice)
                            ) : (
                              <span className="text-neutral-400 line-through">
                                {formatPrice(line.unitPrice)}
                              </span>
                            )}
                          </div>
                          {line.availabilityNotice && (
                            <p className="text-xs font-medium text-red-600">
                              {line.availabilityNotice}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-neutral-100">
                        <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${line.title}`}
                            onClick={() =>
                              updateQuantity(
                                line.item.productId,
                                line.item.variantId,
                                line.item.quantity - 1,
                                line.maxStock
                              )
                            }
                            className="text-neutral-600 hover:text-neutral-900 w-6 h-6 flex items-center justify-center font-bold text-sm disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-medium">
                            {line.item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${line.title}`}
                            disabled={
                              !line.isAvailable ||
                              line.item.quantity >= line.maxStock
                            }
                            onClick={() =>
                              updateQuantity(
                                line.item.productId,
                                line.item.variantId,
                                line.item.quantity + 1,
                                line.maxStock
                              )
                            }
                            className="text-neutral-600 hover:text-neutral-900 w-6 h-6 flex items-center justify-center font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right min-w-20">
                          <div className="text-sm font-bold text-neutral-900">
                            {line.isAvailable ? (
                              formatPrice(line.lineTotal)
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              removeItem(line.item.productId, line.item.variantId)
                            }
                            className="text-xs text-neutral-500 hover:text-red-600 transition-colors mt-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <aside className="border rounded-xl p-6 bg-white shadow-sm space-y-4 lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold text-neutral-900">
              Order Summary
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Available items</span>
                <span>{availableCount}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-semibold text-base text-neutral-900">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
            </div>

            {hasUnavailableItems && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                Unavailable items are excluded from the order subtotal.
              </p>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={true}
                className="w-full py-3 px-4 rounded-lg bg-neutral-200 text-neutral-500 font-medium text-sm cursor-not-allowed border border-neutral-300"
              >
                Proceed to Checkout (Coming soon)
              </button>
              <p className="text-xs text-center text-neutral-500">
                Online checkout will be enabled in an upcoming release.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
