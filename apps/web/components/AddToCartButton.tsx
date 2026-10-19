"use client";

import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";

type AddToCartButtonProps = {
  productId: string;
  variantId?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  maxStock?: number;
};

export default function AddToCartButton({
  productId,
  variantId,
  disabled = false,
  disabledReason,
  maxStock,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => {
      setJustAdded(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const handleAdd = () => {
    if (disabled) return;
    addItem(productId, variantId, 1, maxStock);
    setJustAdded(true);
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled}
        aria-live="polite"
        className={
          "w-full py-3 px-6 rounded-lg font-medium text-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
          (disabled
            ? "bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300"
            : justAdded
              ? "bg-green-700 text-white focus-visible:outline-green-700 shadow-sm"
              : "bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:outline-neutral-900 shadow-sm")
        }
      >
        {justAdded ? "Added to cart ✓" : disabled ? (disabledReason ?? "Unavailable") : "Add to Cart"}
      </button>
      {disabled && disabledReason && (
        <p className="text-xs text-neutral-500 text-center">{disabledReason}</p>
      )}
    </div>
  );
}
