import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCartButton from "../../../components/AddToCartButton";
import ProductGallery from "../../../components/ProductGallery";
import { createClient } from "../../../lib/supabase/server";
import {
  orderedProductImages,
  type ProductImageData,
} from "../../../lib/product-images";
import {
  availabilityLabel,
  combinedAvailability,
  discountInfo,
  hiddenSpecKeys,
  priceSummary,
  selectedVariantId,
  sortedVariants,
  variantAvailability,
  variantLabel,
  type Availability,
  type ProductVariantData,
} from "../../../lib/product-variants";
import type { Database } from "../../../../../packages/types/src";

// Read-only product detail page. Server Component: queries Supabase with the
// requesting user's session (RLS applies) — no service-role key, no writes.
// Anonymous visitors only get products allowed by `products_select_public`
// (verified, active, non-deleted shops); anything RLS hides is a 404.

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ShopRow = Database["public"]["Tables"]["shops"]["Row"];

type ProductDetail = Pick<
  ProductRow,
  | "id"
  | "name"
  | "slug"
  | "description"
  | "brand"
  | "price"
  | "sale_price"
  | "specifications"
  | "warranty"
  | "stock_status"
  | "is_demo"
> & {
  categories: Pick<CategoryRow, "name" | "slug"> | null;
  shops: Pick<ShopRow, "name" | "slug"> | null;
  product_images: ProductImageData[];
  product_variants: ProductVariantData[];
};

// products.id is a uuid column: a malformed id makes Postgres throw 22P02
// (invalid input syntax for type uuid), so reject it before querying.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function stockLabel(status: string): string {
  if (status === "in_stock") return "In stock";
  if (status === "low_stock") return "Low stock";
  if (status === "out_of_stock") return "Out of stock";
  return status;
}

// --- pure helpers start (kept free of imports/JSX so they can be tested) ---

// discountInfo (valid sale = 0 < sale_price < price) now lives in
// lib/product-variants so the listings use the same rule.

const SPEC_ACRONYMS = new Set([
  "ram",
  "rom",
  "cpu",
  "gpu",
  "os",
  "nfc",
  "usb",
  "ssd",
  "hdd",
  "lte",
  "hdmi",
  "gps",
]);

// "ram" -> "RAM", "storage" -> "Storage", "screen_size" -> "Screen size",
// "batteryLife" -> "Battery life". Unknown keys are made readable, never
// hidden.
function specLabel(key: string): string {
  const words = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return key;
  return words
    .map((word, i) => {
      if (SPEC_ACRONYMS.has(word)) return word.toUpperCase();
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

// `hiddenKeys` holds lower-case raw keys (e.g. "ram") that product variants
// already control, so those duplicate rows are left out.
function specEntries(
  specs: ProductRow["specifications"],
  hiddenKeys?: ReadonlySet<string>
): [string, string][] {
  if (specs === null || typeof specs !== "object" || Array.isArray(specs)) {
    return [];
  }
  return Object.entries(specs)
    .filter(([key]) => !hiddenKeys?.has(key.trim().toLowerCase()))
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]): [string, string] => [
      specLabel(key),
      typeof value === "object" ? JSON.stringify(value) : String(value).trim(),
    ])
    .filter(([label, value]) => label.trim() !== "" && value !== "");
}

// --- pure helpers end ---

const AVAILABILITY_CLASS: Record<Availability, string> = {
  in_stock: "text-green-700",
  out_of_stock: "text-neutral-500",
  not_listed: "text-neutral-500",
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
}) {
  const { id } = await params;
  const { variant: variantParam } = await searchParams;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      slug,
      description,
      brand,
      price,
      sale_price,
      specifications,
      warranty,
      stock_status,
      is_demo,
      categories ( name, slug ),
      shops ( name, slug ),
      product_images ( storage_path, alt_text, position, is_primary ),
      product_variants ( id, sku, storage, ram, color, model, price, inventory ( quantity ) )
    `
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ProductDetail | null>();

  if (error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Link
            href="/products"
            className="text-sm text-neutral-500 hover:underline"
          >
            ← Back to products
          </Link>
          <p className="text-sm text-red-600">
            Could not load product: {error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    notFound();
  }

  const product = data;

  // Variants: when a product has them, they decide price and availability and
  // the product-level sale_price is ignored (variants have no sale_price yet).
  const variants = sortedVariants(product.product_variants);
  const hasVariants = variants.length > 0;
  const selectedId = hasVariants
    ? selectedVariantId(variantParam, variants)
    : null;
  const selected = variants.find((variant) => variant.id === selectedId);
  const variantPrices = hasVariants ? priceSummary(variants) : null;
  const availability: Availability | null = !hasVariants
    ? null
    : selected
      ? variantAvailability(selected.inventory)
      : combinedAvailability(variants);

  const discount = hasVariants
    ? null
    : discountInfo(product.price, product.sale_price);
  const specs = specEntries(
    product.specifications,
    hasVariants ? hiddenSpecKeys(variants) : undefined
  );

  let isAddToCartDisabled = false;
  let addToCartDisabledReason: string | undefined;
  let selectedStock: number | undefined;

  if (hasVariants) {
    if (!selected) {
      isAddToCartDisabled = true;
      addToCartDisabledReason = "Please select an option";
    } else {
      const state = variantAvailability(selected.inventory);
      if (state !== "in_stock") {
        isAddToCartDisabled = true;
        addToCartDisabledReason = availabilityLabel(state);
      } else {
        const invRow = Array.isArray(selected.inventory)
          ? selected.inventory[0]
          : selected.inventory;
        if (invRow && Number.isFinite(Number(invRow.quantity))) {
          selectedStock = Number(invRow.quantity);
        }
      }
    }
  } else {
    if (product.stock_status !== "in_stock") {
      isAddToCartDisabled = true;
      addToCartDisabledReason = stockLabel(product.stock_status);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-neutral-500">
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <Link href="/" className="hover:underline">
                  Home
                </Link>
              </li>
              {product.categories && (
                <>
                  <li aria-hidden="true">›</li>
                  <li>
                    <Link
                      href={`/products?category=${encodeURIComponent(
                        product.categories.slug
                      )}`}
                      className="hover:underline"
                    >
                      {product.categories.name}
                    </Link>
                  </li>
                </>
              )}
              <li aria-hidden="true">›</li>
              <li
                aria-current="page"
                className="min-w-0 break-words text-neutral-700"
              >
                {product.name}
              </li>
            </ol>
          </nav>
          <Link href="/products" className="hover:underline">
            ← Back to products
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
          <div className="min-w-0 lg:sticky lg:top-8">
            <ProductGallery
              images={orderedProductImages(
                product.product_images,
                product.name
              )}
            />
          </div>

          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold break-words">
                  {product.name}
                </h1>
                {product.is_demo && (
                  <span className="text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    Demo data
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                {product.brand ? `${product.brand} · ` : ""}
                {product.categories?.name ?? "Uncategorised"}
                {product.shops?.name ? ` · ${product.shops.name}` : ""}
              </p>
            </div>

            <div className="border rounded-lg p-4 flex items-end justify-between gap-4">
              <div className="space-y-1">
                {hasVariants ? (
                  <>
                    <p className="text-2xl font-semibold">
                      {selected
                        ? formatPrice(selected.price)
                        : variantPrices
                          ? `${variantPrices.allSame ? "" : "From "}${formatPrice(
                              variantPrices.lowest
                            )}`
                          : "Price not available"}
                    </p>
                    {selected && (
                      <p className="text-sm text-neutral-500 break-words">
                        {variantLabel(selected)}
                      </p>
                    )}
                  </>
                ) : discount ? (
                  <>
                    <p className="text-2xl font-semibold">
                      {formatPrice(discount.salePrice)}
                    </p>
                    <p className="text-sm text-neutral-500">
                      Regular price{" "}
                      <span className="line-through">
                        {formatPrice(product.price)}
                      </span>
                    </p>
                    <p className="inline-block text-xs font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded">
                      Save {formatPrice(discount.savings)}
                      {discount.percent !== null
                        ? ` (${discount.percent}% off)`
                        : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-semibold">
                    {formatPrice(product.price)}
                  </p>
                )}
              </div>
              {availability !== null ? (
                <p
                  className={
                    "text-sm shrink-0 text-right " +
                    AVAILABILITY_CLASS[availability]
                  }
                >
                  {availabilityLabel(availability)}
                </p>
              ) : (
                <p
                  className={
                    "text-sm shrink-0 " +
                    (product.stock_status === "in_stock"
                      ? "text-green-700"
                      : "text-neutral-500")
                  }
                >
                  {stockLabel(product.stock_status)}
                </p>
              )}
            </div>

            {hasVariants && (
              <section className="space-y-2" aria-labelledby="variant-options">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="variant-options" className="font-medium">
                    Choose an option
                  </h2>
                  {selected && (
                    <Link
                      href={`/products/${product.id}`}
                      scroll={false}
                      className="text-sm text-neutral-500 hover:underline"
                    >
                      Clear selection
                    </Link>
                  )}
                </div>
                <ul className="space-y-2">
                  {variants.map((variant) => {
                    const isSelected = variant.id === selectedId;
                    const state = variantAvailability(variant.inventory);
                    return (
                      <li key={variant.id}>
                        <Link
                          href={`/products/${product.id}?variant=${variant.id}`}
                          scroll={false}
                          aria-current={isSelected ? "true" : undefined}
                          className={
                            "flex items-start justify-between gap-4 rounded-lg border p-3 text-sm hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 " +
                            (isSelected
                              ? "border-neutral-900 ring-1 ring-neutral-900"
                              : "")
                          }
                        >
                          <span className="min-w-0 break-words">
                            {variantLabel(variant)}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-medium">
                              {formatPrice(variant.price)}
                            </span>
                            <span
                              className={
                                "block text-xs " + AVAILABILITY_CLASS[state]
                              }
                            >
                              {availabilityLabel(state)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <div>
              <AddToCartButton
                productId={product.id}
                variantId={selected ? selected.id : null}
                disabled={isAddToCartDisabled}
                disabledReason={addToCartDisabledReason}
                maxStock={selectedStock}
              />
            </div>

            {product.description && (
              <section className="space-y-1">
                <h2 className="font-medium">Description</h2>
                <p className="text-sm text-neutral-700 whitespace-pre-line">
                  {product.description}
                </p>
              </section>
            )}

            {specs.length > 0 && (
              <section className="space-y-2">
                <h2 className="font-medium">Specifications</h2>
                <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
                  {specs.map(([label, value], i) => (
                    <div key={`${label}-${i}`} className="contents">
                      <dt className="text-neutral-500">{label}</dt>
                      <dd className="min-w-0 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {product.warranty && (
              <section className="space-y-1">
                <h2 className="font-medium">Warranty</h2>
                <p className="text-sm text-neutral-700">{product.warranty}</p>
              </section>
            )}

            {product.shops?.name && (
              <p className="text-sm text-neutral-500">
                Sold by{" "}
                <Link
                  href={`/shops/${encodeURIComponent(product.shops.slug)}`}
                  className="hover:underline"
                >
                  {product.shops.name}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
