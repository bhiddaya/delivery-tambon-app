"use client";
import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";

/**
 * หน้า LIFF ชุดเดียวกันใช้ได้สองระบบ (docs/60):
 * LP = /liff (LIFF เดิม, ลูกค้าส่งสลิป) · LLP = /llp (LINE Mini App, จ่ายผ่าน Opn ยืนยันเอง)
 * ไม่มี provider = "/liff" เสมอ → หน้า LP เดิมทำงานเหมือนเดิมทุกอย่าง
 */
export type LiffBase = "/liff" | "/llp";
const Ctx = createContext<LiffBase>("/liff");
export const LiffBaseProvider = ({ base, children }: { base: LiffBase; children: React.ReactNode }) => <Ctx.Provider value={base}>{children}</Ctx.Provider>;
export const useLiffBase = () => useContext(Ctx);

/** ลิงก์ภายในชุด LIFF: href="/register" → /liff/register หรือ /llp/register ตามระบบที่เปิดอยู่ */
export function BaseLink({ href, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  return <Link href={`${useLiffBase()}${href === "/" ? "" : href}`} {...rest} />;
}
