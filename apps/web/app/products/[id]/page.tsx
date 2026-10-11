import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGallery from "../../../components/ProductGallery";
import { createClient } from "../../../lib/supabase/server";
import {
  orderedProductImages,
  type ProductImageData,
} from "../../../lib/product-images";
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

type Discount = {
  salePrice: number;
  savings: number;
  /** Whole-number percent off, or null when it would round to 0%. */
  percent: number | null;
};

// A discount is shown only when 0 < sale_price < price. The database allows
// sale_price = 0 and sale_price >= price, so those (and null / non-finite
// values) must be treated as "no sale" rather than shown as a discount.
// `price` is the regular price; the schema does not call it an MRP.
function discountInfo(
  price: number,
  salePrice: number | null | undefined
): Discount | null {
  if (salePrice == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(salePrice)) return null;
  if (!(salePrice > 0 && salePrice < price)) return null;
  const savings = Math.round((price - salePrice) * 100) / 100;
  // price > salePrice > 0 here, so the division is safe.
  const percent = Math.round((savings / price) * 100);
  return { salePrice, savings, percent: percent >= 1 ? percent : null };
}

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

function specEntries(specs: ProductRow["specifications"]): [string, string][] {
  if (specs === null || typeof specs !== "object" || Array.isArray(specs)) {
    return [];
  }
  return Object.entries(specs)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]): [string, string] => [
      specLabel(key),
      typeof value === "object" ? JSON.stringify(value) : String(value).trim(),
    ])
    .filter(([label, value]) => label.trim() !== "" && value !== "");
}

// --- pure helpers end ---

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
      product_images ( storage_path, alt_text, position, is_primary )
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
  const discount = discountInfo(product.price, product.sale_price);
  const specs = specEntries(product.specifications);

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
                {discount ? (
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
