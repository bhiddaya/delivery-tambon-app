import { tambonDisplayName } from "@/lib/tambon-choice";

/** LINE OA บวรไทย (OA เดียวทุกตำบล) */
export const LINE_OA_ID = "@227eostj";
const SITE = "https://delivery-tambon-app-v3.vercel.app";

/**
 * ลิงก์ LINE ของตำบล: เปิดแชท OA พร้อมข้อความ "ตำบล… #slug" ให้ลูกค้ากดส่ง
 * LINE หลักอ่าน #slug แล้วตั้งตำบลให้ (food_flow set_tambon) และแสดงร้านของตำบลนั้นทันที
 */
export function tambonLineLink(name: string, slug: string): string {
  const text = `${tambonDisplayName(name)} #${slug}`;
  return `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(text)}`;
}

export function tambonWebLink(slug: string): string {
  return `${SITE}/t/${slug}`;
}
