import type { Metadata } from "next";
import LiffLayout from "@/app/liff/layout";
import { LiffBaseProvider } from "@/lib/liff-base";

export const metadata: Metadata = { title: "บวรไทย", robots: { index: false, follow: false } };

/** LLP — LINE Mini App (docs/60): ใช้หน้า LIFF ชุดเดิม แต่ลิงก์อยู่ใต้ /llp และจ่ายผ่าน Opn แทนสลิป */
export default function LlpLayout({ children }: { children: React.ReactNode }) {
  return <LiffBaseProvider base="/llp"><LiffLayout>{children}</LiffLayout></LiffBaseProvider>;
}
