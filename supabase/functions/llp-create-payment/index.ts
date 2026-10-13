// LLP (docs/60): สร้าง QR พร้อมเพย์ผ่าน Opn (Omise) สำหรับออเดอร์ของลูกค้าที่ล็อกอินอยู่
//
// ตั้งค่า (Supabase → Edge Functions → Secrets): OPN_SECRET_KEY = skey_test_… ช่วงทดสอบ
// ยอดเงินคิดจากออเดอร์ในฐานเท่านั้น (items_subtotal + delivery_fee) client ส่งมาแค่เลขออเดอร์
// เรียกซ้ำได้: ถ้ามี charge pending ของออเดอร์นี้อยู่แล้ว คืน QR เดิม ไม่สร้าง charge ใหม่
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const opnKey = Deno.env.get("OPN_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL")!;
  if (!opnKey) return json({ error: "not_configured" }, 503);

  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  const orderId = Number((await req.json().catch(() => ({})))?.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: "bad_request" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: order } = await admin.from("orders")
    .select("id, customer_id, status, items_subtotal, delivery_fee, customer_paid_at, is_test")
    .eq("id", orderId).maybeSingle();
  if (!order || order.customer_id !== user.id) return json({ error: "not_found" }, 404);
  if (order.customer_paid_at) return json({ status: "paid" });
  if (order.status === "cancelled") return json({ error: "order_cancelled" }, 409);

  const { data: open } = await admin.from("llp_payments")
    .select("qr_image, amount").eq("order_id", orderId).eq("status", "pending").maybeSingle();
  if (open?.qr_image) return json({ status: "pending", qr_image: open.qr_image, amount: open.amount });

  const amount = Number(order.items_subtotal ?? 0) + Number(order.delivery_fee ?? 0);
  if (!(amount >= 20)) return json({ error: "amount_too_low" }, 400); // Opn PromptPay ขั้นต่ำ 20 บาท

  const form = new URLSearchParams({
    amount: String(Math.round(amount * 100)), // สตางค์
    currency: "thb",
    "source[type]": "promptpay",
    "metadata[order_id]": String(orderId),
    "metadata[system]": "llp",
  });
  const res = await fetch("https://api.omise.co/charges", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(opnKey + ":"), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const charge = await res.json();
  const qr = charge?.source?.scannable_code?.image?.download_uri;
  if (!res.ok || !qr) {
    console.error("opn charge failed", { status: res.status, code: charge?.code, message: charge?.message });
    return json({ error: "gateway_failed" }, 502);
  }

  const { error } = await admin.from("llp_payments").insert({
    order_id: orderId, provider: "opn", provider_charge_id: charge.id, amount,
    qr_image: qr, expires_at: charge.expires_at ?? null,
  });
  if (error) {
    // อีกคำขอสร้าง pending ไปก่อนหน้า (unique index) → ใช้ของเดิม
    const { data: again } = await admin.from("llp_payments")
      .select("qr_image, amount").eq("order_id", orderId).eq("status", "pending").maybeSingle();
    if (again?.qr_image) return json({ status: "pending", qr_image: again.qr_image, amount: again.amount });
    return json({ error: "save_failed" }, 500);
  }
  return json({ status: "pending", qr_image: qr, amount });
});
