"use client";

import { useCartStore } from "@/lib/cart-store";
import { Card, EmptyState } from "@/components/ui";

interface CartWidgetProps {
  onCheckout?: () => void;
  disabled?: boolean;
}

export default function CartWidget({ onCheckout, disabled }: CartWidgetProps) {
  const { items, loading, error, removeItem, updateQuantity, getTotal } = useCartStore();

  if (items.length === 0) {
    return null;
  }

  const total = getTotal();

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-white z-40">
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="mb-3">
          {/* Cart items summary */}
          <div className="text-sm text-ink-soft mb-2">
            สินค้า {items.length} รายการ • ฿{total.toFixed(2)}
          </div>

          {/* Items list */}
          <div className="space-y-2 max-h-32 overflow-y-auto mb-3">
            {items.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm"
              >
                <div className="flex-1">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-xs text-ink-soft">฿{item.price.toFixed(2)} × {item.quantity}</div>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                    disabled={loading}
                    className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-xs">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                    disabled={loading}
                    className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    +
                  </button>

                  {/* Remove button */}
                  <button
                    onClick={() => removeItem(item.menuItemId)}
                    disabled={loading}
                    className="px-1 py-0.5 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded">
            {error}
          </div>
        )}

        {/* Checkout button */}
        <button
          onClick={onCheckout}
          disabled={disabled || loading || items.length === 0}
          className="w-full py-2 px-4 bg-indigo text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "กำลังบันทึก..." : `ดำเนินการสั่ง (฿${total.toFixed(2)})`}
        </button>
      </div>
    </div>
  );
}
