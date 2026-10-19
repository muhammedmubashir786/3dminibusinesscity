"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addItem as addItemHelper,
  countTotalItems,
  parseStoredCart,
  removeItem as removeItemHelper,
  serializeCart,
  updateQuantity as updateQuantityHelper,
  CART_STORAGE_KEY,
  CART_VERSION,
  type CartItem,
} from "../lib/cart";

type CartContextType = {
  items: CartItem[];
  totalCount: number;
  isLoaded: boolean;
  addItem: (
    productId: string,
    variantId?: string | null,
    quantity?: number,
    maxStock?: number
  ) => void;
  updateQuantity: (
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    maxStock?: number
  ) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load cart from localStorage on client mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      const parsed = parseStoredCart(raw);
      setItems(parsed.items);
    } catch {
      // LocalStorage unavailable (e.g. strict privacy mode)
      setItems([]);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Sync to localStorage whenever items change after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const serialized = serializeCart({ version: CART_VERSION, items });
      window.localStorage.setItem(CART_STORAGE_KEY, serialized);
    } catch {
      // LocalStorage quota or access error
    }
  }, [items, isLoaded]);

  // Synchronize across browser tabs via storage event
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) {
        const parsed = parseStoredCart(event.newValue);
        setItems(parsed.items);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const addItem = useCallback(
    (
      productId: string,
      variantId?: string | null,
      quantity = 1,
      maxStock?: number
    ) => {
      setItems((prev) =>
        addItemHelper(prev, { productId, variantId, quantity }, maxStock)
      );
    },
    []
  );

  const updateQuantity = useCallback(
    (
      productId: string,
      variantId: string | null | undefined,
      quantity: number,
      maxStock?: number
    ) => {
      setItems((prev) =>
        updateQuantityHelper(prev, productId, variantId, quantity, maxStock)
      );
    },
    []
  );

  const removeItem = useCallback(
    (productId: string, variantId?: string | null) => {
      setItems((prev) => removeItemHelper(prev, productId, variantId));
    },
    []
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalCount = useMemo(() => countTotalItems(items), [items]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      totalCount,
      isLoaded,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [items, totalCount, isLoaded, addItem, updateQuantity, removeItem, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
