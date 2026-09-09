import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getLineConfig,
  verifyLineSignature,
  replyMessage,
  liffUrl,
  type LineEvent,
  type LineMessage,
  type LineWebhookBody,
} from "@/lib/line";
import { extractSearchTerm, searchMenu, type ShopResult } from "@/lib/food-search";
import type { Database } from "@/lib/types";

// ต้องใช้ Node runtime เพราะใช้ crypto ในการตรวจลายเซ็น
export const runtime = "nodejs";

// webhook ต้องประมวลผลสด ห้าม cache
export const dynamic = "force-dynamic";

/**
 * LINE Messaging API webhook
 *
 * ตั้งค่า URL นี้ที่ LINE Developers Console → Messaging API → Webhook URL:
 *   https://<โดเมนของคุณ>/api/line/webhook
 *
 * ต้องตั้ง environment variables:
 *   LINE_CHANNEL_SECRET        — ใช้ตรวจว่า request มาจาก LINE จริง
 *   LINE_CHANNEL_ACCESS_TOKEN  — ใช้ส่งข้อความกลับ
 *   NEXT_PUBLIC_LIFF_ID        — (ถ้ามี) ใช้สร้างลิงก์เปิด LIFF app
 */

/** health check — เปิดใน browser เพื่อดูว่าตั้งค่าครบหรือยัง */
export async function GET() {
  const configured = getLineConfig() !== null;

  return NextResponse.json({
    ok: true,
    endpoint: "/api/line/webhook",
    configured,
    liffConfigured: Boolean(process.env.NEXT_PUBLIC_LIFF_ID),
    hint: configured
      ? "พร้อมใช้งาน — ตั้ง Webhook URL นี้ใน LINE Developers Console ได้เลย"
      : "ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN",
  });
}

export async function POST(request: NextRequest) {
  const config = getLineConfig();

  if (!config) {
    // ยังไม่ได้ตั้งค่า — บอกให้ชัด ไม่ใช่ปล่อยพังแบบงง ๆ
    return NextResponse.json(
      { error: "LINE is not configured on this deployment" },
      { status: 503 }
    );
  }

  // ต้องอ่าน body ดิบก่อน parse — ลายเซ็นคำนวณจากตัวอักษรตรง ๆ ที่ LINE ส่งมา
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature, config.channelSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // จัดการทีละ event และกันไม่ให้ event เดียวพังทั้งชุด
  // (ถ้าตอบไม่ใช่ 200 LINE จะส่งซ้ำ ทำให้ผู้ใช้ได้ข้อความซ้ำ)
  await Promise.all(
    (body.events ?? []).map(async (event) => {
      try {
        await handleEvent(event, config.accessToken);
      } catch (error) {
        console.error("[line-webhook] event failed", event.type, error);
      }
    })
  );

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// การจัดการ event — แก้ตรงนี้เวลาจะเพิ่มความสามารถ
// ---------------------------------------------------------------------------

async function handleEvent(event: LineEvent, accessToken: string) {
  switch (event.type) {
    case "follow":
      return handleFollow(event, accessToken);
    case "message":
      return handleMessage(event, accessToken);
    case "postback":
      return handlePostback(event, accessToken);
    default:
      // unfollow / join / leave — ยังไม่ต้องทำอะไร
      return;
  }
}

/** ผู้ใช้เพิ่งเพิ่มเพื่อน OA */
async function handleFollow(event: LineEvent, accessToken: string) {
  if (!event.replyToken) return;

  await replyMessage(
    event.replyToken,
    [
      { type: "text", text: "ยินดีต้อนรับสู่ บวรไทย ตำบลบุ่งไหม 🙏" },
      openAppMessage("แตะปุ่มด้านล่างเพื่อเริ่มใช้งาน"),
    ],
    accessToken
  );
}

/**
 * คำสั่งลัด — ต้องพิมพ์มาทั้งข้อความเท่านั้น
 *
 * เดิมใช้ regex กว้าง ๆ (`/อาหาร|ร้าน/`) ซึ่งกลืนคำค้นไปหมด —
 * "ร้านไหนมีสบู่" ก็จะเข้าเงื่อนไข "ร้าน" แล้วตอบเมนูกลาง ๆ แทนที่จะค้นให้
 * คำสั่งจึงต้องตรงทั้งประโยค ที่เหลือปล่อยให้การค้นหาจัดการ
 */
const SHORTCUTS: { match: string[]; reply: string }[] = [
  { match: ["สั่งอาหาร", "อาหาร", "เมนู"], reply: "เลือกร้านและสั่งอาหารได้ที่นี่" },
  { match: ["ส่งของ", "พัสดุ", "ฝากส่ง"], reply: "แจ้งรายละเอียดพัสดุได้ที่นี่" },
  { match: ["เรียกรถ", "โดยสาร", "ไปส่ง"], reply: "เรียกรถโดยสารได้ที่นี่" },
];

/** ผู้ใช้พิมพ์ข้อความเข้ามา */
async function handleMessage(event: LineEvent, accessToken: string) {
  if (!event.replyToken) return;
  if (event.message?.type !== "text") return;

  const text = (event.message.text ?? "").trim();

  // ๑. คำสั่งลัด (ตรงทั้งประโยค)
  const shortcut = SHORTCUTS.find((s) => s.match.includes(text));
  if (shortcut) {
    await replyMessage(event.replyToken, [openAppMessage(shortcut.reply)], accessToken);
    return;
  }

  // ทักทาย — ต้องดักก่อนการค้น ไม่งั้น "สวัสดีครับ" จะกลายเป็นคำค้น "สวัสดี"
  // แล้วระบบตอบว่า "ยังไม่มีร้านไหนขายสวัสดี" ซึ่งเสียความรู้สึกโดยไม่จำเป็น
  if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi)/i.test(text) && text.length <= 20) {
    await replyMessage(
      event.replyToken,
      [
        {
          type: "text",
          text: "สวัสดีครับ 🙏\nพิมพ์ชื่อของที่อยากได้มาได้เลย เช่น “อยากกินข้าวมันไก่” หรือ “มีสบู่ไหม” เดี๋ยวผมหาร้านในตำบลให้",
        },
      ],
      accessToken
    );
    return;
  }

  if (/^(ติดต่อ|แอดมิน|ช่วยด้วย|สอบถาม)/.test(text)) {
    await replyMessage(
      event.replyToken,
      [
        {
          type: "text",
          text: "ทีมงานจะติดต่อกลับโดยเร็วครับ 🙏\nระหว่างนี้เปิดแอปดูรายการร้านค้าได้เลย",
        },
      ],
      accessToken
    );
    return;
  }

  // ๒. ถือว่าเป็นคำค้น — "อยากกินข้าวมันไก่" → "ข้าวมันไก่"
  const term = extractSearchTerm(text);
  if (term) {
    const shops = await searchMenu(supabaseForWebhook(), term);

    if (shops.length > 0) {
      await replyMessage(event.replyToken, [resultsMessage(term, shops)], accessToken);
      return;
    }

    // ไม่พบ — บอกตรง ๆ ว่าไม่มี ดีกว่าเปลี่ยนเรื่องแล้วให้เขาเดาเอง
    // และคำที่ค้นไม่เจอคือข้อมูลว่าตำบลนี้ยังขาดอะไร ควรเก็บไว้ใช้ชวนร้านมาเปิด
    console.info("[line-webhook] ค้นไม่พบ", { term });
    await replyMessage(
      event.replyToken,
      [
        {
          type: "text",
          text: `ยังไม่มีร้านไหนในตำบลขาย "${term}" ครับ 🙏\nลองพิมพ์ชื่ออย่างอื่น หรือเปิดแอปดูของทั้งหมดที่มีได้เลย`,
        },
        openAppMessage("ดูร้านและสินค้าทั้งหมด"),
      ],
      accessToken
    );
    return;
  }

  await replyMessage(
    event.replyToken,
    [
      {
        type: "text",
        text: "พิมพ์ชื่อของที่อยากได้มาได้เลยครับ เช่น “อยากกินข้าวมันไก่” หรือ “มีสบู่ไหม” 🙏",
      },
      openAppMessage("หรือเปิดแอปดูร้านทั้งหมด"),
    ],
    accessToken
  );
}

// ---------------------------------------------------------------------------
// การค้นหาและการแสดงผล
// ---------------------------------------------------------------------------

/**
 * client สำหรับ webhook — ไม่มี session เพราะคนทักมายังไม่ต้องสมัครก็ได้
 *
 * ใช้ anon key ตรง ๆ ไม่ผ่าน createClient() ของ server.ts เพราะตัวนั้นผูกกับ cookie
 * ของผู้ใช้ ซึ่ง webhook ไม่มี การอ่านเมนูวิ่งผ่านฟังก์ชัน search_menu ที่จำกัด
 * ไว้แล้วว่าคืนเฉพาะร้านที่เปิดอยู่และสินค้าที่ไม่ได้ถูกซ่อน
 */
function supabaseForWebhook() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** ตัดข้อความให้พอดีช่องของ LINE — เกินแล้ว LINE ปฏิเสธทั้งข้อความ ไม่ใช่แค่ตัดให้ */
function fit(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/**
 * ผลการค้น → การ์ดเลื่อนได้ (carousel) ร้านละใบ
 *
 * LINE จำกัด: หัวข้อ 40 ตัวอักษร เนื้อความ 60 ตัวอักษร ป้ายปุ่ม 20 ตัวอักษร
 * และทุกใบต้องมีจำนวนปุ่มเท่ากัน — ไม่งั้น LINE ตอบ 400 ทั้งข้อความ
 */
function resultsMessage(term: string, shops: ShopResult[]): LineMessage {
  const columns = shops.slice(0, 10).map((shop) => {
    const preview = shop.items
      .slice(0, 3)
      .map((i) => `${i.name} ${Math.round(i.price)}฿`)
      .join(", ");

    const url = liffUrl(`/customer/merchants/${shop.merchantId}`);

    return {
      title: fit(shop.merchantName, 40),
      text: fit(preview || shop.merchantCategory || "ดูรายการในร้าน", 60),
      actions: [
        url
          ? { type: "uri", label: "ดูเมนู / สั่ง", uri: url }
          : { type: "message", label: "ดูเมนู", text: `เมนู ${shop.merchantName}` },
      ],
    };
  });

  return {
    type: "template",
    altText: `พบ "${term}" ใน ${shops.length} ร้าน`,
    template: { type: "carousel", columns },
  };
}

/** ผู้ใช้กดปุ่มบน rich menu หรือ template ที่มี postback */
async function handlePostback(event: LineEvent, accessToken: string) {
  if (!event.replyToken) return;

  const data = event.postback?.data ?? "";

  // รูปแบบที่ใช้: action=order, action=parcel, action=ride
  const action = new URLSearchParams(data).get("action");

  const labels: Record<string, string> = {
    order: "เลือกร้านและสั่งอาหารได้ที่นี่",
    parcel: "แจ้งรายละเอียดพัสดุได้ที่นี่",
    ride: "เรียกรถโดยสารได้ที่นี่",
  };

  await replyMessage(
    event.replyToken,
    [openAppMessage(labels[action ?? ""] ?? "เปิดแอปเพื่อใช้งานได้เลย")],
    accessToken
  );
}

/**
 * ข้อความพร้อมปุ่มเปิดแอป
 * ถ้ายังไม่ได้ตั้ง LIFF ID จะส่งเป็นข้อความธรรมดาแทน (ไม่พัง)
 */
function openAppMessage(text: string): LineMessage {
  const url = liffUrl();

  if (!url) {
    return { type: "text", text };
  }

  return {
    type: "template",
    altText: text,
    template: {
      type: "buttons",
      text,
      actions: [{ type: "uri", label: "เปิดแอป", uri: url }],
    },
  };
}
