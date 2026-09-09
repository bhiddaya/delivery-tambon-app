/**
 * notify — ที่เดียวที่ส่งข้อความ LINE ออกจากระบบ
 *
 * ทำไมรวมไว้ที่เดียว: การส่งข้อความต้องใช้ทั้ง secret key ของ Supabase
 * (เพื่ออ่านว่าใครควรได้รับ) และ access token ของ LINE OA ทั้งสองอย่าง
 * ห้ามอยู่ในเบราว์เซอร์ และไม่ควรฝากไว้กับบริการภายนอกอย่าง n8n
 * ผู้เรียกจากภายนอกจึงถือแค่ "รหัสลับสั้น ๆ" อันเดียว (NOTIFY_SECRET)
 * ต่อให้รหัสนั้นหลุด คนได้ไปก็ทำได้แค่สั่งส่งแจ้งเตือน ไม่เห็นข้อมูลใคร
 *
 * โหมด (POST body { action })
 *   new_order      { order_id }  แจ้งไรเดอร์ในตำบลว่ามีงานใหม่
 *   daily_summary  {}            สรุปตัวเลขวันนี้ส่งตัวแทนแต่ละตำบล
 *   health         {}            คืนสถานะระบบให้ n8n คอยดู (ไม่ส่งข้อความ)
 *
 * ทุกโหมดรับ { dry_run: true } เพื่อดูว่าจะส่งหาใครบ้างโดยไม่ส่งจริง
 * — จำเป็นเพราะแพ็กเกจ LINE OA คิดโควตาตามจำนวนผู้รับ ทดสอบผิดครั้งเดียว
 *   ก็เสียโควตาฟรีไปหลายสิบข้อความโดยไม่ได้อะไร
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const LINE_API = "https://api.line.me/v2/bot";

/** multicast ส่งได้ครั้งละไม่เกิน 500 คน */
const MULTICAST_LIMIT = 500;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-notify-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function resolveSecretKey(): string | null {
  return (
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SB_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    null
  );
}

/** เทียบรหัสลับแบบไม่หลุดเวลา — ไม่ให้เดาทีละตัวอักษรจากเวลาที่ตอบกลับ */
function secretMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function sendLine(
  userIds: string[],
  text: string,
  accessToken: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  for (let i = 0; i < userIds.length; i += MULTICAST_LIMIT) {
    const batch = userIds.slice(i, i + MULTICAST_LIMIT);
    const res = await fetch(`${LINE_API}/message/multicast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to: batch, messages: [{ type: "text", text }] }),
    });
    if (res.ok) {
      sent += batch.length;
    } else {
      errors.push(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
  }
  return { sent, errors };
}

const TYPE_LABEL: Record<string, string> = {
  food: "ส่งอาหาร",
  parcel: "ส่งของ/พัสดุ",
  ride: "เรียกรถ",
  agri_service: "บริการการเกษตร",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("NOTIFY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = resolveSecretKey();
  const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
  const liffId = Deno.env.get("LIFF_ID") ?? "2011443365-RD1UinVM";

  if (!expectedSecret) {
    return json(
      { error: "not_configured", hint: "ยังไม่ได้ตั้ง NOTIFY_SECRET ให้ Edge Function" },
      500,
    );
  }

  const given = req.headers.get("x-notify-secret") ?? "";
  if (!secretMatches(given, expectedSecret)) return json({ error: "forbidden" }, 403);

  if (!supabaseUrl || !secretKey) return json({ error: "not_configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request", hint: "body ต้องเป็น JSON" }, 400);
  }

  const action = String(body.action ?? "");
  const dryRun = body.dry_run === true;
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ------------------------------------------------------------------ health
  if (action === "health") {
    const { data: stats, error } = await admin.rpc("tambon_daily_stats");
    if (error) return json({ ok: false, error: error.message }, 500);

    const rows = (stats ?? []) as Record<string, number | string>[];
    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      line_configured: Boolean(lineToken),
      tambons: rows.length,
      // n8n เอาสองค่านี้ไปตั้งเงื่อนไขเตือนได้ตรง ๆ
      total_pending_now: rows.reduce((s, r) => s + Number(r.pending_now ?? 0), 0),
      total_waiting_approval: rows.reduce((s, r) => s + Number(r.waiting_approval ?? 0), 0),
      detail: rows,
    });
  }

  if (!lineToken && !dryRun) {
    return json(
      {
        error: "line_not_configured",
        hint: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN — ใช้ dry_run: true เพื่อทดสอบก่อนได้",
      },
      500,
    );
  }

  // --------------------------------------------------------------- new_order
  if (action === "new_order") {
    const orderId = Number(body.order_id);
    if (!Number.isFinite(orderId)) return json({ error: "missing_order_id" }, 400);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, type, pickup, dropoff, delivery_fee, price, status, tambon_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) return json({ error: "order_lookup_failed", detail: orderErr.message }, 500);
    if (!order) return json({ error: "order_not_found" }, 404);

    // แจ้งเฉพาะงานที่ยังไม่มีคนรับ — กันกรณี trigger ยิงซ้ำหลังมีคนรับไปแล้ว
    if (order.status !== "pending") {
      return json({ ok: true, skipped: "งานนี้มีคนรับแล้ว", sent: 0 });
    }

    const { data: targets, error: targetErr } = await admin.rpc("line_targets_for_new_order", {
      p_order_id: orderId,
    });
    if (targetErr) return json({ error: "target_lookup_failed", detail: targetErr.message }, 500);

    const ids = ((targets ?? []) as { line_user_id: string }[])
      .map((t) => t.line_user_id)
      .filter(Boolean);

    const lines = [
      `🛵 งานใหม่ · ${TYPE_LABEL[order.type] ?? order.type}`,
      order.pickup ? `รับที่ ${order.pickup}` : null,
      order.dropoff ? `ส่งที่ ${order.dropoff}` : null,
      `ค่าส่ง ${Number(order.delivery_fee || order.price || 0).toLocaleString("th-TH")} บาท`,
      "",
      `กดรับงาน: https://liff.line.me/${liffId}`,
    ].filter(Boolean);
    const text = lines.join("\n");

    if (dryRun) return json({ ok: true, dry_run: true, would_send_to: ids.length, text });
    if (ids.length === 0) return json({ ok: true, sent: 0, note: "ยังไม่มีไรเดอร์ที่ผูก LINE" });

    const { sent, errors } = await sendLine(ids, text, lineToken);
    return json({ ok: errors.length === 0, sent, errors });
  }

  // ----------------------------------------------------------- daily_summary
  if (action === "daily_summary") {
    const { data: stats, error } = await admin.rpc("tambon_daily_stats");
    if (error) return json({ error: "stats_failed", detail: error.message }, 500);

    const results: Record<string, unknown>[] = [];

    for (const row of ((stats ?? []) as Record<string, string | number>[])) {
      const { data: targets } = await admin.rpc("line_targets_for_tambon_admin", {
        p_tambon_id: row.tambon_id as string,
      });
      const ids = ((targets ?? []) as { line_user_id: string }[])
        .map((t) => t.line_user_id)
        .filter(Boolean);

      const text = [
        `📊 สรุปวันนี้ · ${row.tambon_name}`,
        "",
        `ออเดอร์วันนี้ ${row.orders_today} (ส่งสำเร็จ ${row.delivered_today})`,
        `รอคนรับตอนนี้ ${row.pending_now}`,
        `ไรเดอร์ออนไลน์ ${row.drivers_online}/${row.drivers_total}`,
        `ร้านเปิดขาย ${row.merchants_open}`,
        Number(row.waiting_approval) > 0 ? `⏳ รออนุมัติ ${row.waiting_approval} ราย` : null,
      ]
        .filter((l) => l !== null)
        .join("\n");

      if (dryRun) {
        results.push({ tambon: row.tambon_name, would_send_to: ids.length, text });
        continue;
      }
      if (ids.length === 0) {
        results.push({ tambon: row.tambon_name, sent: 0, note: "ยังไม่มีตัวแทนที่ผูก LINE" });
        continue;
      }
      const { sent, errors } = await sendLine(ids, text, lineToken);
      results.push({ tambon: row.tambon_name, sent, errors });
    }

    return json({ ok: true, dry_run: dryRun, results });
  }

  return json({ error: "unknown_action", hint: "ใช้ new_order, daily_summary หรือ health" }, 400);
});
