"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Button, Card, Field, Input } from "@/components/ui";
import { money } from "@/lib/domain";
import { getLiffUserId } from "@/lib/cart";
import { useCartStore } from "@/lib/cart-store";
import type { Tables } from "@/lib/types";

const DELIVERY_FEE = 20;

export default function MerchantMenuPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useSession();

  // LIFF context detection
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const isLiffContext = lineUserId !== null;

  // LIFF cart store
  const liffCartItems = useCartStore((state) => state.items);
  const liffAddItem = useCartStore((state) => state.addItem);
  const liffUpdateQuantity = useCartStore((state) => state.updateQuantity);
  const liffSaveCart = useCartStore((state) => state.save);

  const [merchant, setMerchant] = useState<Tables<"merchants"> | null>(null);
  const [menu, setMenu] = useState<Tables<"menu_items">[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<"เงินสดปลายทาง" | "พร้อมเพย์">("เงินสดปลายทาง");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check for LIFF context
    const userId = getLiffUserId();
    setLineUserId(userId);

    // Initialize LIFF cart if in LIFF context
    if (userId && id) {
      useCartStore.getState().initialize(userId, id);
    }
  }, [id]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [{ data: m }, { data: items }] = await Promise.all([
        supabase.from("merchants").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("menu_items")
          .select("*")
          .eq("merchant_id", id)
          .eq("is_available", true)
          .eq("is_hidden", false)
          .order("created_at"),
      ]);
      setMerchant(m ?? null);
      setMenu(items ?? []);
    }
    load();
  }, [id]);

  // Calculate totals based on context
  const getSubtotal = () => {
    if (isLiffContext) {
      return liffCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }
    return menu.reduce((sum, it) => sum + (cart[it.id] || 0) * Number(it.price), 0);
  };

  const getCartCount = () => {
    if (isLiffContext) {
      return liffCartItems.reduce((sum, item) => sum + item.quantity, 0);
    }
    return Object.values(cart).reduce((a, b) => a + b, 0);
  };

  const subtotal = getSubtotal();
  const cartCount = getCartCount();

  function inc(itemId: string) {
    if (isLiffContext && merchant) {
      const item = menu.find((m) => m.id === itemId);
      if (item) {
        const existing = liffCartItems.find((c) => c.menuItemId === itemId);
        if (existing) {
          liffUpdateQuantity(itemId, existing.quantity + 1);
        } else {
          liffAddItem({
            menuItemId: itemId,
            quantity: 1,
            price: Number(item.price),
            name: item.name,
          });
        }
      }
    } else {
      setCart((c) => ({ ...c, [itemId]: (c[itemId] || 0) + 1 }));
    }
  }
  function dec(itemId: string) {
    if (isLiffContext) {
      const existing = liffCartItems.find((c) => c.menuItemId === itemId);
      if (existing && existing.quantity > 0) {
        liffUpdateQuantity(itemId, existing.quantity - 1);
      }
    } else {
      setCart((c) => ({ ...c, [itemId]: Math.max(0, (c[itemId] || 0) - 1) }));
    }
  }

  async function placeOrder() {
    if (!merchant || cartCount === 0) return;
    setSubmitting(true);

    try {
      if (isLiffContext && lineUserId) {
        // LIFF mode: save cart to Supabase
        const saved = await liffSaveCart(lineUserId, merchant.id);
        if (saved) {
          alert("บันทึกตะกร้าเรียบร้อย");
          router.push("/customer");
        } else {
          alert("ไม่สามารถบันทึกตะกร้าได้");
        }
      } else {
        // Regular mode: create order immediately
        const supabase = createClient();
        const { data: order, error } = await supabase
          .from("orders")
          .insert({
            type: "food",
            tambon_id: profile.tambon_id!,
            customer_id: profile.id,
            merchant_id: merchant.id,
            pickup: merchant.name,
            dropoff: address || "ไม่ระบุที่อยู่",
            items_subtotal: subtotal,
            delivery_fee: DELIVERY_FEE,
            price: subtotal + DELIVERY_FEE,
            payment_method: payment,
          })
          .select()
          .single();

        if (error || !order) {
          alert("สั่งซื้อไม่สำเร็จ: " + (error?.message ?? "unknown error"));
          setSubmitting(false);
          return;
        }

        const lines = menu
          .filter((it) => cart[it.id] > 0)
          .map((it) => ({
            order_id: order.id,
            menu_item_id: it.id,
            name: it.name,
            qty: cart[it.id],
            price: it.price,
          }));
        if (lines.length) {
          await supabase.from("order_items").insert(lines);
        }

        router.push("/customer/orders");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!merchant) return <p className="text-ink-soft text-sm">กำลังโหลด...</p>;

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-indigo font-head font-semibold mb-3">
        ‹ กลับ
      </button>
      <h1 className="text-lg font-semibold">{merchant.name}</h1>
      <p className="text-ink-soft text-sm mb-4">{merchant.category}</p>

      <Card className="!p-0 divide-y divide-border mb-5">
        {menu.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-3">
            {it.photo_url && (
              <img
                src={it.photo_url}
                alt={it.name}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-lg object-cover bg-surface-2"
              />
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm">{it.name}</div>
              <div className="text-ink-soft text-xs">{money(Number(it.price))}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => dec(it.id)}
                className="w-7 h-7 rounded-lg border border-border bg-surface-2 font-bold"
              >
                −
              </button>
              <b className="w-4 text-center tabular-nums">
                {isLiffContext
                  ? liffCartItems.find((c) => c.menuItemId === it.id)?.quantity || 0
                  : cart[it.id] || 0}
              </b>
              <button
                onClick={() => inc(it.id)}
                className="w-7 h-7 rounded-lg border border-border bg-surface-2 font-bold"
              >
                +
              </button>
            </div>
          </div>
        ))}
        {menu.length === 0 && <p className="p-4 text-ink-soft text-sm">ร้านนี้ยังไม่มีเมนู</p>}
      </Card>

      {cartCount > 0 && (
        <>
          {!isLiffContext && (
            <>
              <Field label="ที่อยู่จัดส่ง">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ / จุดสังเกต" />
              </Field>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(["เงินสดปลายทาง", "พร้อมเพย์"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPayment(p)}
                    className={`rounded-lg border py-2.5 text-sm ${
                      payment === p ? "border-indigo bg-indigo-tint" : "border-border"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}
          <Card className="mb-4 flex items-center justify-between">
            <span className="text-ink-soft text-sm">
              รวม ({cartCount} รายการ) {!isLiffContext && `+ ค่าส่ง ${money(DELIVERY_FEE)}`}
            </span>
            <b className="font-head">{money(isLiffContext ? subtotal : subtotal + DELIVERY_FEE)}</b>
          </Card>
          <Button variant="accent" className="w-full" onClick={placeOrder} disabled={submitting}>
            {submitting
              ? isLiffContext
                ? "กำลังบันทึกตะกร้า..."
                : "กำลังสั่งซื้อ..."
              : isLiffContext
              ? `บันทึกตะกร้า · ${money(subtotal)}`
              : `สั่งซื้อ · ${money(subtotal + DELIVERY_FEE)}`}
          </Button>
        </>
      )}
    </div>
  );
}
