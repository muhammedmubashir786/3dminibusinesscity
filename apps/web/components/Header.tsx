"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export default function Header() {
  const { totalCount, isLoaded } = useCart();

  return (
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/products"
            className="font-semibold text-lg hover:opacity-80 transition-opacity flex items-center gap-2"
          >
            <span>Virtual Angadi</span>
            <span lang="ml" className="text-xs font-normal text-neutral-500 hidden sm:inline">
              വെർച്വൽ അങ്ങാടി കച്ചവടം
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/products" className="hover:text-neutral-900 transition-colors">
              Products
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/cart"
            aria-label={`Cart with ${isLoaded ? totalCount : 0} items`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 hover:border-neutral-400 text-sm font-medium transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-neutral-700"
              aria-hidden="true"
            >
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            <span>Cart</span>
            {isLoaded && totalCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-neutral-900 rounded-full min-w-5">
                {totalCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
