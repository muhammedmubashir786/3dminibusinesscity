"use client";

import { useState, type KeyboardEvent } from "react";
import ProductImage from "./ProductImage";
import type { ResolvedProductImage } from "../lib/product-images";

// Lightweight product gallery for the detail page. No library, no zoom.
//
//   0 images -> the standard placeholder
//   1 image  -> exactly the plain single image (no controls)
//   2+       -> main image, Previous/Next (wrapping), thumbnails, counter
//
// `images` must already be in display order (see orderedProductImages).
// A main image that fails to load falls back to the placeholder (handled by
// <ProductImage>), and the next image still works.

type Props = {
  images: ResolvedProductImage[];
};

const BUTTON_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="w-5 h-5"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

export default function ProductGallery({ images }: Props) {
  const [index, setIndex] = useState(0);
  const total = images.length;

  if (total === 0) {
    return <ProductImage image={null} variant="hero" />;
  }
  if (total === 1) {
    return <ProductImage image={images[0] ?? null} variant="hero" />;
  }

  const current = Math.min(index, total - 1);
  const mainImage = images[current] ?? null;

  const goTo = (next: number) => setIndex((next + total) % total);
  const goPrevious = () => goTo(current - 1);
  const goNext = () => goTo(current + 1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
  };

  return (
    <div
      role="group"
      aria-label="Product images"
      onKeyDown={onKeyDown}
      className="space-y-3"
    >
      <div className="relative">
        {/* key resets the load-failure state when the image changes */}
        <ProductImage
          key={mainImage?.src ?? "none"}
          image={mainImage}
          variant="gallery"
        />
        <button
          type="button"
          onClick={goPrevious}
          aria-label="Previous image"
          className={`absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border bg-white/90 text-neutral-700 shadow flex items-center justify-center hover:bg-white ${BUTTON_FOCUS}`}
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next image"
          className={`absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border bg-white/90 text-neutral-700 shadow flex items-center justify-center hover:bg-white ${BUTTON_FOCUS}`}
        >
          <Chevron direction="right" />
        </button>
      </div>

      <p className="text-xs text-neutral-500 text-center" aria-hidden="true">
        {current + 1} / {total}
      </p>
      <p className="sr-only" aria-live="polite">
        Image {current + 1} of {total}
      </p>

      <ul className="flex gap-2 overflow-x-auto p-1">
        {images.map((image, i) => (
          <li key={image.src} className="shrink-0">
            <button
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show image ${i + 1} of ${total}`}
              aria-current={i === current ? "true" : undefined}
              className={`block rounded-md ${BUTTON_FOCUS} ${
                i === current
                  ? "ring-2 ring-neutral-900"
                  : "ring-1 ring-neutral-200 hover:ring-neutral-400"
              }`}
            >
              <ProductImage image={image} variant="thumb" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
