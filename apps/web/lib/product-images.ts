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

/**
 * All displayable images for a product, in gallery order: the primary image
 * first, then by position. Rows whose URL cannot be built are dropped.
 * Alt text falls back to "<name> (n of N)" when a row has none; with a
 * single image it is just the product name.
 */
export function orderedProductImages(
  images: ProductImageData[] | null | undefined,
  fallbackAlt: string
): ResolvedProductImage[] {
  if (!images || images.length === 0) return [];

  const sorted = [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.position - b.position;
  });

  const withUrl = sorted.flatMap((image) => {
    const src = productImageUrl(image.storage_path);
    return src ? [{ src, altText: image.alt_text?.trim() ?? "" }] : [];
  });

  const total = withUrl.length;
  return withUrl.map(({ src, altText }, index) => ({
    src,
    alt:
      altText ||
      (total === 1 ? fallbackAlt : `${fallbackAlt} (${index + 1} of ${total})`),
  }));
}
