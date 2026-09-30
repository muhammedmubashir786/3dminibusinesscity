import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
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

function specEntries(specs: ProductRow["specifications"]): [string, string][] {
  if (specs === null || typeof specs !== "object" || Array.isArray(specs)) {
    return [];
  }
  return Object.entries(specs)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value),
    ]);
}

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
      shops ( name, slug )
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
  const onSale =
    product.sale_price != null && product.sale_price < product.price;
  const specs = specEntries(product.specifications);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <nav className="text-sm text-neutral-500 flex flex-wrap gap-2">
          <Link href="/products" className="hover:underline">
            ← Back to products
          </Link>
          {product.categories && (
            <>
              <span>·</span>
              <Link
                href={`/products?category=${product.categories.slug}`}
                className="hover:underline"
              >
                More in {product.categories.name}
              </Link>
            </>
          )}
        </nav>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{product.name}</h1>
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
          <div>
            {onSale ? (
              <>
                <p className="text-2xl font-semibold">
                  {formatPrice(product.sale_price as number)}
                </p>
                <p className="text-sm text-neutral-400 line-through">
                  {formatPrice(product.price)}
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
              "text-sm " +
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
              {specs.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-neutral-500">{key}</dt>
                  <dd>{value}</dd>
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
            Sold by {product.shops.name}
          </p>
        )}
      </div>
    </main>
  );
}
