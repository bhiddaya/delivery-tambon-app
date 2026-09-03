"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Button, Card, Field, Input } from "@/components/ui";
import { money } from "@/lib/domain";
import type { Tables } from "@/lib/types";

export default function MerchantHomePage() {
  const { profile } = useSession();
  const [merchant, setMerchant] = useState<Tables<"merchants"> | null>(null);
  const [menu, setMenu] = useState<Tables<"menu_items">[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data: m } = await supabase.from("merchants").select("*").eq("profile_id", profile.id).maybeSingle();
    setMerchant(m ?? null);
    if (m) {
      const { data: items } = await supabase
        .from("menu_items")
        .select("*")
        .eq("merchant_id", m.id)
        .order("created_at");
      setMenu(items ?? []);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  if (!profile.approved) {
    return (
      <Card>
        <p className="font-head font-semibold mb-1">รอการอนุมัติจากแอดมิน</p>
        <p className="text-ink-soft text-sm">
          ร้านของคุณอยู่ระหว่างรอแอดมินตรวจสอบ ระหว่างนี้เพิ่มเมนูเตรียมไว้ได้เลย ลูกค้าจะยังไม่เห็นร้านจนกว่าจะได้รับการอนุมัติ
        </p>
      </Card>
    );
  }

  if (!merchant) return <p className="text-ink-soft text-sm">กำลังโหลด...</p>;

  async function toggleOpen() {
    if (!merchant) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("merchants").update({ is_open: !merchant.is_open }).eq("id", merchant.id);
    setBusy(false);
    load();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant || !newName || !newPrice) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("menu_items").insert({
      merchant_id: merchant.id,
      name: newName,
      price: Number(newPrice),
    });
    setNewName("");
    setNewPrice("");
    setBusy(false);
    load();
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    await supabase.from("menu_items").delete().eq("id", id);
    load();
  }

  async function toggleAvailable(item: Tables<"menu_items">) {
    const supabase = createClient();
    await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id);
    load();
  }

  return (
    <div>
      <Card className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{merchant.name}</h1>
          <p className="text-ink-soft text-sm">{merchant.category}</p>
        </div>
        <Button variant={merchant.is_open ? "primary" : "secondary"} onClick={toggleOpen} disabled={busy}>
          {merchant.is_open ? "เปิดร้าน" : "ปิดร้าน"}
        </Button>
      </Card>

      <h2 className="font-head font-semibold text-sm mb-2">เมนู</h2>
      <Card className="!p-0 divide-y divide-border mb-4">
        {menu.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">{it.name}</div>
              <div className="text-ink-soft text-xs">{money(Number(it.price))}</div>
            </div>
            <button
              onClick={() => toggleAvailable(it)}
              className={`text-xs font-head font-semibold rounded-full px-2.5 py-1 ${
                it.is_available ? "bg-jade-tint text-jade" : "bg-surface-2 text-ink-soft"
              }`}
            >
              {it.is_available ? "พร้อมขาย" : "หมด"}
            </button>
            <button onClick={() => removeItem(it.id)} className="text-clay text-xs font-head font-semibold">
              ลบ
            </button>
          </div>
        ))}
        {menu.length === 0 && <p className="p-4 text-ink-soft text-sm">ยังไม่มีเมนู เพิ่มด้านล่างได้เลย</p>}
      </Card>

      <Card>
        <form onSubmit={addItem} className="flex gap-2 items-end">
          <Field label="ชื่อเมนู">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น ผัดกะเพราหมู" />
          </Field>
          <Field label="ราคา">
            <Input
              type="number"
              min={0}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="45"
            />
          </Field>
          <Button type="submit" disabled={busy} className="mb-3">
            เพิ่ม
          </Button>
        </form>
      </Card>
    </div>
  );
}
