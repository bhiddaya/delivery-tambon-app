import crypto from "crypto";

/**
 * Helpers สำหรับคุยกับ LINE Messaging API
 *
 * อ่านค่า config ตอนเรียกใช้จริง (ไม่ใช่ตอน import) เพื่อให้ `next build`
 * ผ่านได้แม้ยังไม่ได้ตั้ง environment variables — เหมือนที่ทำกับ Supabase
 */

const LINE_API = "https://api.line.me/v2/bot";

export type LineConfig = {
  channelSecret: string;
  accessToken: string;
};

/** คืนค่า config ถ้าตั้งครบ, คืน null ถ้ายังไม่ได้ตั้ง (ไม่ throw) */
export function getLineConfig(): LineConfig | null {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) return null;

  return { channelSecret, accessToken };
}

/**
 * ตรวจสอบว่า request มาจาก LINE จริง
 *
 * LINE เซ็น body ด้วย HMAC-SHA256 โดยใช้ channel secret แล้วส่งมาใน header
 * `x-line-signature` — ถ้าไม่ตรวจ ใครก็ยิง request ปลอมเข้ามาได้
 *
 * @param rawBody body ดิบ **ก่อน** parse JSON (ต้องเป็น string ตรงตัวที่ LINE ส่งมา)
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // ความยาวต่างกัน = ไม่ตรงแน่นอน (timingSafeEqual จะ throw ถ้าความยาวไม่เท่ากัน)
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// ชนิดข้อมูลของ event ที่ LINE ส่งมา (เอาเท่าที่ใช้จริง)
// ---------------------------------------------------------------------------

export type LineSource = {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
};

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "sticker"; packageId: string; stickerId: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }
  | { type: "template"; altText: string; template: Record<string, unknown> }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

export type LineEvent = {
  type: "message" | "follow" | "unfollow" | "postback" | "join" | "leave";
  replyToken?: string;
  source: LineSource;
  timestamp: number;
  message?: { type: string; id: string; text?: string };
  postback?: { data: string; params?: Record<string, string> };
};

export type LineWebhookBody = {
  destination?: string;
  events: LineEvent[];
};

// ---------------------------------------------------------------------------
// ส่งข้อความ
// ---------------------------------------------------------------------------

async function callLineApi(
  path: string,
  accessToken: string,
  payload: unknown
): Promise<void> {
  const response = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE API ${path} failed (${response.status}): ${detail}`);
  }
}

/**
 * ตอบกลับข้อความที่ผู้ใช้เพิ่งส่งมา — ฟรี ไม่นับโควตา
 * ใช้ได้ครั้งเดียวต่อ replyToken และ token หมดอายุใน ~30 วินาที
 */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[],
  accessToken: string
): Promise<void> {
  await callLineApi("/message/reply", accessToken, { replyToken, messages });
}

/**
 * ส่งข้อความหาผู้ใช้เมื่อไหร่ก็ได้ — **นับโควตา** ของแพ็กเกจ LINE OA
 * ใช้ตอนแจ้งเตือน เช่น "ไรเดอร์รับงานแล้ว" ที่ไม่ได้เกิดจากผู้ใช้ทักมา
 */
export async function pushMessage(
  to: string,
  messages: LineMessage[],
  accessToken: string
): Promise<void> {
  await callLineApi("/message/push", accessToken, { to, messages });
}

/** ลิงก์เปิด LIFF app จากในแชท LINE */
export function liffUrl(path = ""): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return null;

  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `https://liff.line.me/${liffId}${suffix}`;
}
