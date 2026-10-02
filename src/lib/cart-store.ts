import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { CartItem } from "@/lib/cart";

interface CartState {
  items: CartItem[];
  loading: boolean;
  error: string | null;

  // Actions
  initialize: (lineUserId: string, merchantId: string) => Promise<void>;
  addItem: (item: CartItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  getTotal: () => number;
  save: (lineUserId: string, merchantId: string) => Promise<boolean>;
  clear: (lineUserId: string) => Promise<boolean>;
  reset: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  initialize: async (lineUserId: string, merchantId: string) => {
    set({ loading: true, error: null });
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("carts")
        .select("*")
        .eq("line_user_id", lineUserId)
        .eq("merchant_id", merchantId)
        .maybeSingle();

      if (error) throw error;

      set({
        items: (data?.items as CartItem[] | undefined) ?? [],
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load cart",
        loading: false,
      });
    }
  },

  addItem: (item: CartItem) => {
    set((state) => {
      const existing = state.items.find((i) => i.menuItemId === item.menuItemId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.menuItemId === item.menuItemId
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
        };
      }
      return { items: [...state.items, item] };
    });
  },

  removeItem: (menuItemId: string) => {
    set((state) => ({
      items: state.items.filter((i) => i.menuItemId !== menuItemId),
    }));
  },

  updateQuantity: (menuItemId: string, quantity: number) => {
    set((state) => {
      if (quantity <= 0) {
        return {
          items: state.items.filter((i) => i.menuItemId !== menuItemId),
        };
      }
      return {
        items: state.items.map((i) =>
          i.menuItemId === menuItemId ? { ...i, quantity } : i
        ),
      };
    });
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  save: async (lineUserId: string, merchantId: string) => {
    set({ loading: true, error: null });
    try {
      const supabase = createClient();
      const { error } = await supabase.from("carts").upsert(
        {
          line_user_id: lineUserId,
          merchant_id: merchantId,
          items: get().items,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "line_user_id" }
      );

      if (error) throw error;

      set({ loading: false });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save cart";
      set({
        error: errorMsg,
        loading: false,
      });
      return false;
    }
  },

  clear: async (lineUserId: string) => {
    set({ loading: true, error: null });
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("carts")
        .delete()
        .eq("line_user_id", lineUserId);

      if (error) throw error;

      set({ items: [], loading: false });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to clear cart";
      set({
        error: errorMsg,
        loading: false,
      });
      return false;
    }
  },

  reset: () => {
    set({ items: [], error: null, loading: false });
  },
}));
