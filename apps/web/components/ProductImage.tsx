"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedProductImage } from "../lib/product-images";

// Shows a product image, or a neutral placeholder when there is no image or
// the file fails to load (missing object, network error, bad path).
//
// Client component only because a failed <img> load can only be detected in
// the browser. The server still renders the full <img> in the initial HTML,
// so the page works and is indexable without JavaScript.
//
// Plain <img> on purpose: local Supabase runs without imgproxy, and
// next/image would need remotePatterns config that differs per environment.

type Props = {
  image: ResolvedProductImage | null;
  /** "thumb": 80x80 card thumbnail. "hero": large image on the detail page. */
  variant: "thumb" | "hero";
};

const PLACEHOLDER_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
    focusable="false"
    className="w-full h-full text-neutral-300"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export default function ProductImage({ image, variant }: Props) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = image?.src ?? null;

  // The browser may finish (and fail) loading the server-rendered <img>
  // before React hydrates, in which case onError never fires. Check the
  // element's state once on mount, and reset when the source changes.
  useEffect(() => {
    const el = imgRef.current;
    setFailed(Boolean(el && el.complete && el.naturalWidth === 0));
  }, [src]);

  const showImage = image !== null && !failed;

  if (variant === "thumb") {
    return showImage ? (
      // eslint-disable-next-line @next/next/no-img-element -- see note above
      <img
        ref={imgRef}
        src={image.src}
        alt={image.alt}
        width={80}
        height={80}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-20 h-20 object-cover rounded-md bg-neutral-100"
      />
    ) : (
      <div
        role="img"
        aria-label="No image available"
        className="w-20 h-20 rounded-md bg-neutral-100 flex items-center justify-center"
      >
        <span className="w-8 h-8 block">{PLACEHOLDER_ICON}</span>
      </div>
    );
  }

  return showImage ? (
    <div className="border rounded-lg overflow-hidden bg-neutral-50">
      {/* eslint-disable-next-line @next/next/no-img-element -- see note above */}
      <img
        ref={imgRef}
        src={image.src}
        alt={image.alt}
        width={768}
        height={432}
        onError={() => setFailed(true)}
        className="w-full max-h-96 object-contain"
      />
    </div>
  ) : (
    <div
      role="img"
      aria-label="No image available"
      className="border rounded-lg bg-neutral-50 flex items-center justify-center h-48"
    >
      <span className="w-12 h-12 block">{PLACEHOLDER_ICON}</span>
    </div>
  );
}
