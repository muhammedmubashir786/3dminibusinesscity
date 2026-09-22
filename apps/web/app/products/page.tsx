import { createClient } from "../../lib/supabase/server";
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
};

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function ProductsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
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
      categories ( name, slug ),
      shops ( name, slug )
    `
    )
    .order("name", { ascending: true })
    .returns<ProductWithRelations[]>();

  if (error) {
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
            Showing {products.length} product{products.length === 1 ? "" : "s"} from verified shops.
          </p>
        </div>

        {products.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No products available yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {products.map((product) => (
              <li
                key={product.id}
                className="border rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{product.name}</h2>
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