"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * เชื่อม LIFF (LINE Front-end Framework) เข้ากับแอป
 *
 * ออกแบบให้ **ไม่พัง** ในทุกกรณี:
 * - เปิดจากเบราว์เซอร์ปกติ (ไม่ได้อยู่ในแอป LINE) → ใช้งานเว็บได้ตามปกติ
 * - ยังไม่ได้ตั้ง NEXT_PUBLIC_LIFF_ID → ข้ามการ init ไปเลย
 * - LIFF init ล้มเหลว → บันทึก error แล้วปล่อยให้เว็บทำงานต่อ
 *
 * ตั้งใจ **ไม่บังคับ login อัตโนมัติ** เพราะจะทำให้คนที่เปิดจากเบราว์เซอร์
 * ธรรมดาโดนเด้งไปหน้า LINE ทันที ให้หน้าที่ต้องการค่อยเรียก login() เอง
 */

export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

export type LiffStatus = "loading" | "ready" | "disabled" | "error";

export type LiffContextValue = {
  status: LiffStatus;
  error: string | null;
  /** เปิดอยู่ในแอป LINE หรือไม่ (false = เบราว์เซอร์ปกติ) */
  isInClient: boolean;
  isLoggedIn: boolean;
  profile: LiffProfile | null;
  login: () => void;
  logout: () => void;
  /**
   * ID token ที่เอาไปแลก session ของ Supabase ได้ (ต้องมี scope `openid`)
   * คืน null ถ้ายังไม่ได้ล็อกอิน LINE หรือ LIFF ยังไม่พร้อม
   */
  getIdToken: () => string | null;
};

const LiffContext = createContext<LiffContextValue>({
  status: "loading",
  error: null,
  isInClient: false,
  isLoggedIn: false,
  profile: null,
  login: () => {},
  logout: () => {},
  getIdToken: () => null,
});

export function useLiff() {
  return useContext(LiffContext);
}

export default function LiffProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<LiffStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isInClient, setIsInClient] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [liff, setLiff] = useState<typeof import("@line/liff").default | null>(
    null
  );

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

    if (!liffId) {
      setStatus("disabled");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // โหลดตอนรันในเบราว์เซอร์เท่านั้น — SDK แตะ window ตั้งแต่ import
        const mod = await import("@line/liff");
        const sdk = mod.default;

        await sdk.init({ liffId });
        if (cancelled) return;

        setLiff(sdk);
        setIsInClient(sdk.isInClient());

        const loggedIn = sdk.isLoggedIn();
        setIsLoggedIn(loggedIn);

        if (loggedIn) {
          const p = await sdk.getProfile();
          if (cancelled) return;
          setProfile({
            userId: p.userId,
            displayName: p.displayName,
            pictureUrl: p.pictureUrl,
            statusMessage: p.statusMessage,
          });
        }

        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        // เปิดนอกแอป LINE หรือ LIFF ID ผิด — เว็บยังต้องใช้งานได้
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<LiffContextValue>(
    () => ({
      status,
      error,
      isInClient,
      isLoggedIn,
      profile,
      login: () => {
        if (liff && !liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
        }
      },
      logout: () => {
        if (liff && liff.isLoggedIn()) {
          liff.logout();
          setIsLoggedIn(false);
          setProfile(null);
        }
      },
      getIdToken: () => {
        if (!liff || !liff.isLoggedIn()) return null;
        return liff.getIDToken();
      },
    }),
    [status, error, isInClient, isLoggedIn, profile, liff]
  );

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}
