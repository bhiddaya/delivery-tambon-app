import { createClient } from "@/lib/supabase/client";

/**
 * แลก ID token ของ LINE เป็น session ของ Supabase
 *
 * ฝั่งเซิร์ฟเวอร์อยู่ที่ Supabase Edge Function ชื่อ `line-login`
 * (โค้ดอยู่ใน supabase/functions/line-login/index.ts)
 *
 * ทำไมต้องผ่าน Edge Function: การจะสร้าง/หาผู้ใช้ใน auth ต้องใช้ secret key
 * ซึ่งห้ามอยู่ในเบราว์เซอร์เด็ดขาด เบราว์เซอร์จึงส่งได้แค่ ID token
 * แล้วให้ฝั่งเซิร์ฟเวอร์เป็นคนตัดสินว่าจะออก session ให้หรือไม่
 *
 * ตัว token_hash ที่ได้กลับมาใช้ได้ครั้งเดียวและหมดอายุเร็ว
 * ถึงมีคนดักได้ก็เอาไปทำอะไรต่อไม่ได้ถ้าเราแลกทันทีแบบนี้
 */

export type LineSignInResult = {
  /** มีโปรไฟล์ในระบบแล้วหรือยัง — ถ้ายัง ต้องพาไป /onboarding */
  hasProfile: boolean;
  isNewUser: boolean;
  displayName: string | null;
};

export class LineSignInError extends Error {}

function functionsUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/functions/v1/line-login`;
}

export async function signInWithLineIdToken(idToken: string): Promise<LineSignInResult> {
  const endpoint = functionsUrl();
  if (!endpoint) throw new LineSignInError("ยังไม่ได้ตั้งค่า Supabase");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.token_hash) {
    // ข้อความ error ของ endpoint เป็นรหัสสั้น ๆ ไม่ได้เขียนให้ผู้ใช้อ่าน
    // จึงแปลงเป็นภาษาคนตรงนี้ แล้วเก็บรหัสไว้ใน console ให้คนแก้บั๊กดู
    console.error("line-login failed", payload);
    throw new LineSignInError("เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: payload.token_hash as string,
  });
  if (error) throw new LineSignInError(error.message);

  return {
    hasProfile: Boolean(payload.has_profile),
    isNewUser: Boolean(payload.is_new_user),
    displayName: (payload.display_name as string | null) ?? null,
  };
}
