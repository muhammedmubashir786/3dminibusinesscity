import Link from "next/link";
import ProductImage from "../../components/ProductImage";
import { createClient } from "../../lib/supabase/server";
import {
  primaryProductImage,
  type ProductImageData,
} from "../../lib/product-images";
import type { Database } from "../../../../packages/types/src";

// This page is a Server Component: it queries Supabase using the
// requesting user's session (via cookies), so ordinary RLS applies —
// no service-role key, no bypass. Public/anonymous visitors see exactly
// what the `products_select_public` policy allows (verified, active,
// non-deleted shops only). No writes happen here.

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ShopRow = Database["public"]["Tables"]["shops"]["Row"];

type ProductWithRelations = ProductRow & {
  categories: Pick<CategoryRow, "name" | "slug"> | null;
  shops: Pick<ShopRow, "name" | "slug"> | null;
  product_images: ProductImageData[];
};

type CategoryNavItem = Pick<CategoryRow, "name" | "slug">;

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

const MAX_SEARCH_LENGTH = 80;

// Normalise the raw ?q= value for use inside a PostgREST .or() ilike filter.
// Characters that are structural in the filter syntax (, ( ) " \) or act as
// wildcards (% _ *) are dropped rather than escaped, so user input can never
// alter the filter or turn into a wildcard. Whitespace is collapsed.
function cleanSearchTerm(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[,()"\\%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

function productsHref(category?: string, q?: string): string {
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (q) qs.set("q", q);
  const str = qs.toString();
  return str ? `/products?${str}` : "/products";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    q?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const categorySlug =
    typeof params.category === "string" ? params.category : undefined;
  const searchTerm = cleanSearchTerm(
    typeof params.q === "string" ? params.q : undefined
  );

  const supabase = await createClient();

  // Small, separate query for the filter nav — always shows all 10
  // approved categories, regardless of whether the current filter has
  // matches, so a category with zero products is still browsable/linkable.
  const { data: categoriesData } = await supabase
    .from("categories")
    .select("name, slug")
    .order("name", { ascending: true })
    .returns<CategoryNavItem[]>();

  const categories = categoriesData ?? [];
  const activeCategory = categorySlug
    ? categories.find((c) => c.slug === categorySlug)
    : undefined;

  let query = supabase
    .from("products")
    .select(
      `
      id,
      name,
      slug,
      brand,
      price,
      sale_price,
      is_demo,
      stock_status,
      categories!inner ( name, slug ),
      shops ( name, slug ),
      product_images ( storage_path, alt_text, position, is_primary )
    `
    )
    .order("name", { ascending: true });

  // .eq on an embedded relation requires the !inner hint above to actually
  // restrict which product rows come back (a plain embed only shapes the
  // nested object, it doesn't filter parents). If categorySlug doesn't
  // match any real category, this simply returns zero rows — no crash,
  // handled by the existing empty state below.
  if (categorySlug) {
    query = query.eq("categories.slug", categorySlug);
  }

  // Search by name or brand (case-insensitive substring). Runs through the
  // same RLS client, so only products the visitor may see can match.
  if (searchTerm) {
    query = query.or(
      `name.ilike.*${searchTerm}*,brand.ilike.*${searchTerm}*`
    );
  }

  const { data, error } = await query.returns<ProductWithRelations[]>();

  if (error) {
    // Surface the real Postgres/RLS error rather than swallowing it —
    // useful while the catalog is still sparse and RLS is still new.
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-2xl font-semibold mb-4">Products</h1>
        <p className="text-sm text-red-600">
          Could not load products: {error.message}
        </p>
      </main>
    );
  }

  const products = data ?? [];

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Products <span className="text-sm text-neutral-500">Kochi · Electronics, Mobile &amp; Technology</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Showing {products.length} product{products.length === 1 ? "" : "s"}
            {searchTerm ? ` matching “${searchTerm}”` : ""}
            {activeCategory ? ` in ${activeCategory.name}` : " from verified shops"}.
          </p>
        </div>

        <form action="/products" method="get" className="flex gap-2">
          {categorySlug && (
            <input type="hidden" name="category" value={categorySlug} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={searchTerm}
            maxLength={MAX_SEARCH_LENGTH}
            placeholder="Search by name or brand"
            aria-label="Search products by name or brand"
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="text-sm px-4 py-1.5 rounded-lg bg-neutral-900 text-white"
          >
            Search
          </button>
          {searchTerm && (
            <Link
              href={productsHref(categorySlug)}
              className="text-sm px-3 py-1.5 text-neutral-600 hover:underline"
            >
              Clear
            </Link>
          )}
        </form>

        <nav className="flex flex-wrap gap-2">
          <Link
            href={productsHref(undefined, searchTerm)}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (!categorySlug
                ? "bg-neutral-900 text-white border-neutral-900"
                : "text-neutral-600 border-neutral-300 hover:border-neutral-400")
            }
          >
            All
          </Link>
          {categories.map((category) => (
            <a
              key={category.slug}
              href={productsHref(category.slug, searchTerm)}
              className={
                "text-xs px-3 py-1 rounded-full border " +
                (categorySlug === category.slug
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "text-neutral-600 border-neutral-300 hover:border-neutral-400")
              }
            >
              {category.name}
            </a>
          ))}
        </nav>

        {products.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {searchTerm || categorySlug
              ? "No products match your search or filter."
              : "No products available yet."}
          </p>
        ) : (
          <ul className="space-y-4">
            {products.map((product) => (
              <li
                key={product.id}
                className="border rounded-lg p-4 flex items-start gap-4"
              >
                {/* Decorative duplicate of the name link below: hidden from
                    keyboard and screen readers so the product is not
                    announced twice. */}
                <Link
                  href={`/products/${product.id}`}
                  className="shrink-0"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <ProductImage
                    image={primaryProductImage(
                      product.product_images,
                      product.name
                    )}
                    variant="thumb"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">
                      <Link
                        href={`/products/${product.id}`}
                        className="hover:underline"
                      >
                        {product.name}
                      </Link>
                    </h2>
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
                  {product.stock_status !== "in_stock" && (
                    <p className="text-xs text-neutral-400 mt-1">
                      {product.stock_status === "out_of_stock"
                        ? "Out of stock"
                        : "Low stock"}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {product.sale_price != null && product.sale_price < product.price ? (
                    <>
                      <p className="font-semibold">{formatPrice(product.sale_price)}</p>
                      <p className="text-sm text-neutral-400 line-through">
                        {formatPrice(product.price)}
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold">{formatPrice(product.price)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}