import type { ReactNode } from "react";

/**
 * กรอบสำหรับหน้าก่อนล็อกอิน (login/signup/onboarding) — ใช้แนวคิดเดียวกับ AppShell:
 * ความกว้างคงที่แบบมือถือเสมอ บนจอกว้างจะลอยเป็นการ์ดกลางจอ บนมือถือเต็มจอพอดี
 */
export function AuthFrame({
  children,
  maxWidth = "max-w-sm",
}: {
  children: ReactNode;
  maxWidth?: "max-w-sm" | "max-w-md";
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8 sm:bg-surface-2">
      <div
        className={`w-full ${maxWidth} sm:rounded-[2rem] sm:border sm:border-border sm:bg-paper sm:px-8 sm:py-10 sm:shadow-2xl`}
      >
        {children}
      </div>
    </div>
  );
}
