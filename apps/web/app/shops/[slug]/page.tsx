import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "../../../components/ProductImage";
import { createClient } from "../../../lib/supabase/server";
import {
  primaryProductImage,
  type ProductImageData,
} from "../../../lib/product-images";
import type { Database } from "../../../../../packages/types/src";

// Read-only shop page. Server Component: queries Supabase with the requesting
// user's session (RLS applies) — no service-role key, no writes. Anonymous
// visitors only see shops allowed by `shops_select_public` (active,
// non-deleted, verified merchant) and products allowed by
// `products_select_public`. The merchants table is never queried, so no
// merchant contact data can reach this page.

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ShopRow = Database["public"]["Tables"]["shops"]["Row"];

type ShopInfo = Pick<
  ShopRow,
  "id" | "name" | "slug" | "address" | "city" | "is_demo"
>;

type ShopProduct = Pick<
  ProductRow,
  "id" | "name" | "brand" | "price" | "sale_price" | "is_demo" | "stock_status"
> & {
  categories: Pick<CategoryRow, "name" | "slug"> | null;
  product_images: ProductImageData[];
};

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createClient();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name, slug, address, city, is_demo")
    .eq("slug", slug)
    .maybeSingle()
    .returns<ShopInfo | null>();

  if (shopError) {
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
            Could not load shop: {shopError.message}
          </p>
        </div>
      </main>
    );
  }

  if (!shop) {
    notFound();
  }

  const { data: productsData, error: productsError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      brand,
      price,
      sale_price,
      is_demo,
      stock_status,
      categories ( name, slug ),
      product_images ( storage_path, alt_text, position, is_primary )
    `
    )
    .eq("shop_id", shop.id)
    .order("name", { ascending: true })
    .returns<ShopProduct[]>();

  const products = productsData ?? [];

  const address = shop.address ?? "";
  const city = shop.city ?? "";
  const location = address.toLowerCase().includes(city.toLowerCase())
    ? address
    : [address, city].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <nav className="text-sm text-neutral-500">
          <Link href="/products" className="hover:underline">
            ← Back to products
          </Link>
        </nav>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{shop.name}</h1>
            {shop.is_demo && (
              <span className="text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                Demo data
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            {location}
          </p>
          {!productsError && (
            <p className="text-sm text-neutral-500">
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {productsError ? (
          <p className="text-sm text-red-600">
            Could not load products: {productsError.message}
          </p>
        ) : products.length === 0 ? (
          <p className="text-sm text-neutral-500">No products listed yet.</p>
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
                  {product.sale_price != null &&
                  product.sale_price < product.price ? (
                    <>
                      <p className="font-semibold">
                        {formatPrice(product.sale_price)}
                      </p>
                      <p className="text-sm text-neutral-400 line-through">
                        {formatPrice(product.price)}
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold">
                      {formatPrice(product.price)}
                    </p>
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
