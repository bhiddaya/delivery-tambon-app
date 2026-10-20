/**
 * push-notify — ส่ง Web Push (แจ้งเตือนของมือถือ) ให้ร้านค้า/ไรเดอร์/ตัวแทนตำบล เมื่อมีออเดอร์ใหม่หรือยืนยันเงิน
 *
 * ใครเรียก: trigger ในฐานข้อมูล (orders_push_new / orders_push_paid ผ่าน pg_net) และ admin_send_sound_test() ด้วยรหัสลับเดียวกับ n8n (vault notify_secret)
 * ใครได้รับ: เลือกใน SQL ที่ push_targets() (ร้านของออเดอร์ · ไรเดอร์ออนไลน์ในตำบล · ผู้ดูแลตำบล+ผู้ดูแลกลาง)
 * กุญแจ VAPID: สร้างครั้งแรกด้วย { action: "init" } แล้วเก็บใน vault เท่านั้น คำตอบคืนเฉพาะกุญแจสาธารณะ
 *
 * POST body
 *   { action: "init" }                          สร้างกุญแจถ้ายังไม่มี
 *   { order_id, event: "new" | "paid" }         ส่งแจ้งเตือนออเดอร์ (ใส่ dry_run: true เพื่อดูว่าจะส่งหาใครโดยไม่ส่งจริง)
 *   { action: "broadcast" }                     ส่งสัญญาณทดสอบเสียงถึงทุกเครื่องที่เปิดแจ้งเตือน (dry_run ได้)
 * เซิร์ฟเวอร์แจ้งเตือนที่ใช้คือของ Google/Apple/Mozilla ตามเบราว์เซอร์ของผู้รับ เนื้อหาเข้ารหัส ไม่ผ่าน LINE ไม่นับโควต้า LINE
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SITE = "https://delivery-tambon-app-v3.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-notify-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** เหมือน line-login: โปรเจกต์นี้ปิด legacy JWT keys จึงลองกุญแจแบบใหม่ก่อน */
function resolveSecretKey(): string | null {
  for (const name of ["SUPABASE_SECRET_KEY", "SB_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

export type PushKind = "merchant" | "driver" | "agent";
type OrderInfo = { id: number; type: string; is_test: boolean; is_drill: boolean; event: "new" | "paid"; shop: string | null; tambon: string | null };

const TYPE_TH: Record<string, string> = { food: "สั่งอาหาร/ของแห้ง", parcel: "ส่งของ", ride: "เรียกรถ/ส่งคน", agri_service: "จ้างรถเกษตร" };
// การสั่นต่างกันตามบทบาท (เฉพาะ Android) — เสียงเป็นของเครื่อง เว็บเลือกเองไม่ได้
const VIBRATE: Record<PushKind, number[]> = {
  merchant: [300, 100, 300, 100, 300],
  driver: [600, 200, 600, 200, 600],
  agent: [200, 100, 200, 100, 200, 100, 200],
};
const URL_OF: Record<PushKind, string> = { merchant: "/merchant/orders", driver: "/driver", agent: "/admin/workspace" };

/** ข้อความแจ้งเตือนของแต่ละบทบาท (ออเดอร์ซ้อม/ทดสอบมีป้ายนำหน้า) */
export function buildPayload(order: OrderInfo, kind: PushKind) {
  const prefix = order.is_drill ? "[ซ้อม] " : order.is_test ? "[ทดสอบ] " : "";
  const type = TYPE_TH[order.type] ?? order.type;
  const place = order.tambon ? ` · ${order.tambon}` : "";
  let title: string;
  let body: string;
  if (kind === "merchant") {
    title = order.event === "paid" ? `${prefix}✅ ยืนยันเงินแล้ว #${order.id}` : `${prefix}🛒 ออเดอร์ใหม่ #${order.id}`;
    body = order.event === "paid" ? "เตรียมอาหารได้เลย" : order.type === "food" ? "รอตัวแทนยืนยันเงิน แล้วเตรียมอาหาร" : type;
  } else if (kind === "driver") {
    title = `${prefix}🛵 งานใหม่ #${order.id}`;
    body = `${type}${place}`;
  } else {
    title = `${prefix}📋 ออเดอร์ใหม่ #${order.id}`;
    body = `${type}${order.shop ? ` · ร้าน ${order.shop}` : ""}${place}`;
  }
  return { title, body, url: URL_OF[kind], tag: `order-${order.id}-${kind}`, vibrate: VIBRATE[kind] };
}

/**
 * สัญญาณทดสอบเสียง: ทำให้เหมือนแจ้งเตือนงานจริง (มีเลขที่ ชนิดงาน และข้อความเฉพาะเจาะจง)
 * เพราะ Chrome มือถือตรวจข้อความอัตโนมัติและถอนสิทธิ์เว็บที่ส่งข้อความทดสอบแบบกว้างๆ ซ้ำๆ ว่าเป็นสแปม (17 ต.ค. 69)
 */
export function buildBroadcastPayload(kind: PushKind, sentAt = Date.now()) {
  const hhmm = new Date(sentAt + 7 * 3_600_000).toISOString().slice(11, 16);
  const code = `ซ้อม${hhmm.replace(":", "")}`;
  const title = kind === "merchant" ? `[ซ้อม] 🛒 ออเดอร์ใหม่ #${code}` : kind === "driver" ? `[ซ้อม] 🛵 งานใหม่ #${code}` : `[ซ้อม] 📋 ออเดอร์ใหม่ #${code}`;
  const body = kind === "merchant" ? "งานซ้อมเสียงแจ้งเตือนของบวรไทย ไม่ต้องเตรียมอาหาร" : "งานซ้อมเสียงแจ้งเตือนของบวรไทย ไม่ต้องรับงาน";
  // tag ไม่ซ้ำทุกครั้ง: ถ้า tag ซ้ำ มือถือถือว่าเป็นการอัปเดตแจ้งเตือนเดิมและอาจไม่ส่งเสียงซ้ำ
  return { title, body, url: URL_OF[kind], tag: `sound-test-${sentAt}`, vibrate: VIBRATE[kind] };
}

type Target = { id: string; endpoint: string; p256dh: string; auth: string; kind: PushKind };
type Admin = ReturnType<typeof createClient>;
type Payload = { title: string; body: string; tag: string };
type FcmAccount = { project_id: string; client_email: string; private_key: string };

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

/** แอป Android "บวรไทย": แลกบัญชีบริการ Firebase (secret FCM_SERVICE_ACCOUNT) เป็น access token ด้วย JWT RS256 */
async function fcmAccessToken(account: FcmAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(JSON.stringify({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const der = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(der), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`fcm token ${res.status}`);
  return (await res.json()).access_token;
}

/** ส่งเป็น data message: แอปสร้างแจ้งเตือนเองด้วยช่องที่มีเสียง "บวรไทยมาแล้ว" (เสียงเลือกได้ ต่างจากเว็บ) */
function sendFcm(account: FcmAccount, accessToken: string, token: string, payload: Payload): Promise<Response> {
  return fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { token, data: { title: payload.title, body: payload.body, tag: payload.tag }, android: { priority: "high" } } }),
  });
}

/** ส่งถึงทุกเครื่องพร้อมกัน แล้วลบเครื่องที่เลิกรับแล้ว (เซิร์ฟเวอร์แจ้งเตือนตอบ 404/410) */
async function deliver(admin: Admin, targets: Target[], payloadFor: (kind: PushKind) => Payload) {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  const account = raw ? JSON.parse(raw) as FcmAccount : null;
  let fcmToken: Promise<string> | undefined;
  const results = await Promise.all(targets.map(async (t) => {
    if (t.endpoint.startsWith("fcm:")) {
      if (!account) return { id: t.id, kind: t.kind, status: 0 };
      try {
        fcmToken ??= fcmAccessToken(account);
        const res = await sendFcm(account, await fcmToken, t.endpoint.slice(4), payloadFor(t.kind));
        return { id: t.id, kind: t.kind, status: res.status };
      } catch {
        return { id: t.id, kind: t.kind, status: 0 };
      }
    }
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify(payloadFor(t.kind)),
        { TTL: 600, urgency: "high" },
      );
      return { id: t.id, kind: t.kind, status: 201 };
    } catch (e) {
      return { id: t.id, kind: t.kind, status: Number((e as { statusCode?: number }).statusCode) || 0 };
    }
  }));
  const dead = results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.id);
  if (dead.length) await admin.rpc("push_delete_subscriptions", { p_ids: dead });
  return {
    ok: true,
    targets: targets.length,
    sent: results.filter((r) => r.status >= 200 && r.status < 300).length,
    removed: dead.length,
    results: results.map(({ kind, status }) => ({ kind, status })),
  };
}

function countByKind(targets: Target[]) {
  const byKind: Record<string, number> = {};
  for (const t of targets) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  return byKind;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secretKey = resolveSecretKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secretKey || !supabaseUrl) return json({ error: "not_configured" }, 500);
  const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: keys, error: keyError } = await admin.rpc("push_get_keys");
  if (keyError || !keys) return json({ error: "keys_unavailable" }, 500);
  const expected = keys.notify_secret as string | null;
  if (!expected || req.headers.get("x-notify-secret") !== expected) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  if (body.action === "init") {
    if (keys.public && keys.private) return json({ ok: true, created: false, public: keys.public });
    const fresh = webpush.generateVAPIDKeys();
    const { error } = await admin.rpc("push_set_keys", { p_public: fresh.publicKey, p_private: fresh.privateKey });
    if (error) return json({ error: "save_failed" }, 500);
    return json({ ok: true, created: true, public: fresh.publicKey });
  }

  if (!keys.public || !keys.private) return json({ error: "no_vapid_keys" }, 503);

  if (body.action === "broadcast") {
    const { data, error } = await admin.rpc("push_broadcast_targets");
    if (error) return json({ error: "targets_failed" }, 500);
    const targets = (data ?? []) as Target[];
    if (body.dry_run === true) return json({ ok: true, dry_run: true, targets: targets.length, by_kind: countByKind(targets) });
    webpush.setVapidDetails(SITE, keys.public as string, keys.private as string);
    const sentAt = Date.now();
    return json(await deliver(admin, targets, (kind) => buildBroadcastPayload(kind, sentAt)));
  }

  const orderId = Number(body.order_id);
  const event = body.event;
  if (!Number.isFinite(orderId) || (event !== "new" && event !== "paid")) return json({ error: "bad_request" }, 400);

  const { data: found, error: targetError } = await admin.rpc("push_targets", { p_order_id: orderId, p_event: event });
  if (targetError || !found?.ok) return json({ error: "targets_failed", reason: found?.reason ?? null }, targetError ? 500 : 404);
  const order = found.order as OrderInfo;
  const targets = (found.targets ?? []) as Target[];

  if (body.dry_run === true) return json({ ok: true, dry_run: true, targets: targets.length, by_kind: countByKind(targets) });

  webpush.setVapidDetails(SITE, keys.public as string, keys.private as string);
  return json(await deliver(admin, targets, (kind) => buildPayload(order, kind)));
});
