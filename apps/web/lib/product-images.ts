import type { Database } from "../../../packages/types/src";

// Helpers for rendering product_images rows. Server-safe (no React, no
// browser APIs). Images live in the public `product-images` Storage bucket;
// product_images.storage_path is the object key inside that bucket.

type ProductImageRow = Database["public"]["Tables"]["product_images"]["Row"];

/** The columns the pages select from the embedded product_images rows. */
export type ProductImageData = Pick<
  ProductImageRow,
  "storage_path" | "alt_text" | "position" | "is_primary"
>;

/** What the <ProductImage> component needs to render a real image. */
export type ResolvedProductImage = {
  src: string;
  alt: string;
};

/**
 * Public Storage URL for an object path, or null if the Supabase URL is not
 * configured (callers then show the placeholder instead of a broken URL).
 * Each path segment is URL-encoded so spaces/special characters in file names
 * cannot break the URL; "/" separators are kept.
 */
export function productImageUrl(storagePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !storagePath) return null;
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/product-images/${encodedPath}`;
}

/**
 * Pick the image to show for a product: the primary one, else the lowest
 * position, else null (placeholder). `fallbackAlt` is used when the row has
 * no alt_text (normally the product name).
 */
export function primaryProductImage(
  images: ProductImageData[] | null | undefined,
  fallbackAlt: string
): ResolvedProductImage | null {
  if (!images || images.length === 0) return null;

  const chosen =
    images.find((image) => image.is_primary) ??
    images.reduce((best, image) =>
      image.position < best.position ? image : best
    );

  const src = productImageUrl(chosen.storage_path);
  if (!src) return null;

  return { src, alt: chosen.alt_text?.trim() || fallbackAlt };
}
