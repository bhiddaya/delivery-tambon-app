const ORIGIN = "https://local.invalid";

/** รับเฉพาะเส้นทางภายในเว็บ กันการส่งต่อไปยังเว็บอื่น — ให้ URL ของเบราว์เซอร์ตัดสิน เพราะ "/\evil.com" กับ "/\t/evil.com" ไปโดเมนอื่นได้ */
export function safeNextPath(value: string | null): string | null {
  if (!value?.startsWith("/")) return null;
  try {
    const url = new URL(value, ORIGIN);
    return url.origin === ORIGIN ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

/** ปลายทางหลังเข้าสู่ระบบ เช่นกดชื่อร้านจากหน้าตำบล ?next=/customer/merchants/<id> */
export function nextParam(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
