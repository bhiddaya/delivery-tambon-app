"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { money } from "@/lib/domain";

const RIDE_FARE = 45;

export default function RideOrderPage() {
  const router = useRouter();
  const { profile } = useSession();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"เงินสดปลายทาง" | "พร้อมเพย์">("เงินสดปลายทาง");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("orders").insert({
      type: "ride",
      tambon_id: profile.tambon_id!,
      customer_id: profile.id,
      pickup,
      dropoff,
      note,
      items_subtotal: 0,
      delivery_fee: 0,
      price: RIDE_FARE,
      payment_method: payment,
    });
    setSubmitting(false);
    if (error) {
      alert("เรียกรถไม่สำเร็จ: " + error.message);
      return;
    }
    router.push("/customer/orders");
  }

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-indigo font-head font-semibold mb-3">
        ‹ กลับ
      </button>
      <h1 className="text-lg font-semibold mb-4">เรียกรถ</h1>
      <form onSubmit={submit}>
        <Field label="จุดขึ้นรถ">
          <Input required value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="เช่น หน้าบ้าน / ตลาด" />
        </Field>
        <Field label="จุดหมายปลายทาง">
          <Input required value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="ที่อยู่ปลายทาง" />
        </Field>
        <Field label="หมายเหตุ">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="จำนวนผู้โดยสาร / สัมภาระ" />
        </Field>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["เงินสดปลายทาง", "พร้อมเพย์"] as const).map((p) => (
            <button
              type="button"
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
        <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
          {submitting ? "กำลังเรียกรถ..." : `เรียกรถ (โดยประมาณ ${money(RIDE_FARE)})`}
        </Button>
      </form>
    </div>
  );
}
