import { NextRequest, NextResponse } from "next/server";
import {
  getLineConfig,
  verifyLineSignature,
  replyMessage,
  liffUrl,
  type LineEvent,
  type LineMessage,
  type LineWebhookBody,
} from "@/lib/line";

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

/** ผู้ใช้พิมพ์ข้อความเข้ามา */
async function handleMessage(event: LineEvent, accessToken: string) {
  if (!event.replyToken) return;
  if (event.message?.type !== "text") return;

  const text = (event.message.text ?? "").trim();

  // คำสั่งง่าย ๆ ก่อน — ค่อยขยายเป็น flow เต็มทีหลัง
  if (/สั่งอาหาร|สั่ง|อาหาร|ร้าน/.test(text)) {
    await replyMessage(
      event.replyToken,
      [openAppMessage("เลือกร้านและสั่งอาหารได้ที่นี่")],
      accessToken
    );
    return;
  }

  if (/ส่งของ|พัสดุ|ฝากส่ง/.test(text)) {
    await replyMessage(
      event.replyToken,
      [openAppMessage("แจ้งรายละเอียดพัสดุได้ที่นี่")],
      accessToken
    );
    return;
  }

  if (/เรียกรถ|โดยสาร|ไปส่ง/.test(text)) {
    await replyMessage(
      event.replyToken,
      [openAppMessage("เรียกรถโดยสารได้ที่นี่")],
      accessToken
    );
    return;
  }

  if (/ติดต่อ|แอดมิน|ช่วย|สอบถาม/.test(text)) {
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

  await replyMessage(
    event.replyToken,
    [openAppMessage("เปิดแอปเพื่อสั่งอาหาร ส่งของ หรือเรียกรถได้เลย")],
    accessToken
  );
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
