import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

export type CartItem = {
  menuItemId: string;
  quantity: number;
  price: number;
  name?: string;
};

export type Cart = {
  line_user_id: string;
  merchant_id: string;
  items: CartItem[];
  updated_at: string;
};

/**
 * Get LIFF user ID from sessionStorage
 * Set by the /liff entry point page
 */
export function getLiffUserId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const profile = sessionStorage.getItem("liff_profile");
    if (!profile) return null;
    const parsed = JSON.parse(profile);
    return parsed.userId || null;
  } catch {
    return null;
  }
}

/**
 * Load cart for LIFF user from Supabase
 */
export async function loadLiffCart(lineUserId: string): Promise<Cart | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("carts")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load cart:", error);
    return null;
  }

  return data as Cart | null;
}

/**
 * Save/update cart for LIFF user in Supabase
 */
export async function saveLiffCart(
  lineUserId: string,
  merchantId: string,
  items: CartItem[]
): Promise<boolean> {
  const supabase = createClient();

  const { error } = await supabase.from("carts").upsert(
    {
      line_user_id: lineUserId,
      merchant_id: merchantId,
      items: items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "line_user_id" }
  );

  if (error) {
    console.error("Failed to save cart:", error);
    return false;
  }

  return true;
}

/**
 * Clear cart for LIFF user
 */
export async function clearLiffCart(lineUserId: string): Promise<boolean> {
  const supabase = createClient();

  const { error } = await supabase
    .from("carts")
    .delete()
    .eq("line_user_id", lineUserId);

  if (error) {
    console.error("Failed to clear cart:", error);
    return false;
  }

  return true;
}

/**
 * Get cart total price
 */
export function getCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Add item to cart
 */
export function addToCart(
  items: CartItem[],
  item: CartItem
): CartItem[] {
  const existing = items.find((i) => i.menuItemId === item.menuItemId);

  if (existing) {
    return items.map((i) =>
      i.menuItemId === item.menuItemId
        ? { ...i, quantity: i.quantity + item.quantity }
        : i
    );
  }

  return [...items, item];
}

/**
 * Remove item from cart
 */
export function removeFromCart(
  items: CartItem[],
  menuItemId: string
): CartItem[] {
  return items.filter((i) => i.menuItemId !== menuItemId);
}

/**
 * Update item quantity in cart
 */
export function updateCartItemQuantity(
  items: CartItem[],
  menuItemId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) {
    return removeFromCart(items, menuItemId);
  }

  return items.map((i) =>
    i.menuItemId === menuItemId ? { ...i, quantity } : i
  );
}
