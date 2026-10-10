"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LiffSendError, errorCode } from "@/lib/liff-send";

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
  /**
   * บังคับขอสิทธิ์จาก LINE ใหม่
   *
   * ใช้ตอนล็อกอินอยู่แล้วแต่ไม่มี ID token ซึ่งแปลว่าผู้ใช้ยังไม่เคยอนุญาต
   * scope `openid` — เกิดได้เมื่อเพิ่ม scope ทีหลัง คนที่เคยกดอนุญาตไว้ก่อนหน้า
   * จะยังถือสิทธิ์ชุดเก่าอยู่จนกว่าจะอนุญาตใหม่
   */
  relogin: () => void;
  /**
   * ส่งข้อความในนามผู้ใช้เข้าแชตที่เปิดหน้านี้ขึ้นมา (เช่นแชตกับ OA บวรไทย)
   * ต้องเปิดจากแชตในแอป LINE และต้องเปิดสิทธิ์ chat_message.write ที่ LIFF ในคอนโซล LINE
   * ถ้าผู้ใช้ยังไม่เคยอนุญาต จะให้ LINE ขออนุญาตก่อนส่ง
   * โยน LiffSendError ถ้าส่งไม่ได้ (บอกสาเหตุ) ให้ผู้เรียกมีทางสำรอง
   */
  sendText: (text: string) => Promise<void>;
  /** สถานะสิทธิ์ส่งข้อความเข้าแชต "unknown" = ตรวจไม่ได้ (เช่นเปิดนอกแอป LINE) */
  chatPermission: () => Promise<"granted" | "prompt" | "unavailable" | "unknown">;
  /**
   * ถ้ายังไม่เคยอนุญาตส่งข้อความ ให้ LINE แสดงหน้าขออนุญาต (หลังอนุญาต LINE อาจโหลดหน้าใหม่)
   * เรียกตั้งแต่เข้าหน้าแรกของ LIFF ก่อนที่ลูกค้าจะมีตะกร้า
   */
  askChatPermission: () => Promise<void>;
  /** ปิดหน้า LIFF กลับไปที่แชต (ไม่ทำอะไรถ้าไม่ได้เปิดในแอป LINE) */
  closeWindow: () => void;
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
  relogin: () => {},
  sendText: async () => {
    throw new LiffSendError("not_in_client");
  },
  chatPermission: async () => "unknown",
  askChatPermission: async () => {},
  closeWindow: () => {},
});

export function useLiff() {
  return useContext(LiffContext);
}

type Sdk = typeof import("@line/liff").default;

/** ถาม LINE ว่าผู้ใช้อนุญาตให้ส่งข้อความเข้าแชตหรือยัง (unavailable = LIFF นี้ไม่ได้เปิดสิทธิ์ chat_message.write ที่คอนโซล) */
async function queryChat(liff: Sdk | null): Promise<"granted" | "prompt" | "unavailable" | "unknown"> {
  if (!liff) return "unknown";
  try {
    return (await liff.permission.query("chat_message.write")).state;
  } catch {
    return "unknown";
  }
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
      // อ่าน env ตอน render ไม่ได้อย่างปลอดภัยเพราะหน้าเหล่านี้ prerender
      // ตั้งครั้งเดียวตอน mount ไม่ใช่ cascading render ที่กฎนี้กันอยู่
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot config check on mount
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
      relogin: () => {
        if (!liff) return;
        // ออกก่อนแล้วเข้าใหม่ เพื่อให้ LINE แสดงหน้าขออนุญาตอีกครั้ง
        // (ถ้าไม่ออกก่อน LINE จะถือว่าอนุญาตแล้วและข้ามหน้านั้นไป)
        try {
          if (liff.isLoggedIn()) liff.logout();
        } catch {
          // ในแอป LINE บางรุ่น logout ทำไม่ได้ — ไม่เป็นไร ลอง login ต่อเลย
        }
        liff.login({ redirectUri: window.location.href });
      },
      chatPermission: () => queryChat(liff),
      askChatPermission: async () => {
        if (!liff || !liff.isInClient()) return;
        if ((await queryChat(liff)) !== "prompt") return;
        try {
          await liff.permission.requestAll();
        } catch {
          // ผู้ใช้ไม่อนุญาตหรือปิดหน้าต่าง: ตอนกดสั่งเลยจะมีทางสำรองเปิด LINE ให้ส่งเอง
        }
      },
      sendText: async (text: string) => {
        if (!liff || !liff.isInClient()) throw new LiffSendError("not_in_client");
        const state = await queryChat(liff);
        if (state === "unavailable") throw new LiffSendError("scope_unavailable");
        if (state === "prompt") {
          try {
            await liff.permission.requestAll();
          } catch (err) {
            throw new LiffSendError("failed", errorCode(err));
          }
        }
        try {
          await liff.sendMessages([{ type: "text", text }]);
        } catch (err) {
          throw new LiffSendError("failed", errorCode(err));
        }
      },
      closeWindow: () => {
        if (liff && liff.isInClient()) liff.closeWindow();
      },
    }),
    [status, error, isInClient, isLoggedIn, profile, liff]
  );

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}
