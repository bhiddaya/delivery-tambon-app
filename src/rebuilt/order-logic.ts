import type { Tables } from "@/lib/types";

export type MenuItem = Tables<"menu_items">;
export type Basket = Record<string, number>;

export function basketLines(menu: MenuItem[], basket: Basket) {
  return menu.filter(item => !item.is_hidden && item.is_available && Number.isFinite(basket[item.id]) && (basket[item.id] ?? 0) >= 1 && Number.isFinite(Number(item.price)) && Number(item.price) >= 0)
    .map(item => ({ item, quantity: Math.min(99, Math.max(1, Math.floor(basket[item.id]))) }));
}

export function basketSubtotal(menu: MenuItem[], basket: Basket): number {
  return basketLines(menu, basket).reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0);
}

export function configuredBaseFee(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Number(value);
}

export function nextDriverStatus(status: string): "in_progress" | "delivered" | null {
  return status === "accepted" ? "in_progress" : status === "in_progress" ? "delivered" : null;
}
