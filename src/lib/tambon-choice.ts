/**
 * ตำบลที่ผู้ใช้กดมาจากหน้า /t/[slug]
 *
 * หน้า /t/[slug] ส่ง ?t=<slug> ไปที่ /signup และ /login แล้วเก็บไว้ในเครื่อง เพราะระหว่างทาง
 * อาจมีการเด้งออกไปล็อกอิน LINE แล้วกลับมา (query หาย) — /onboarding จึงอ่านจากที่เก็บไว้
 * เพื่อเลือกตำบลให้ตรง ไม่ตกไปที่ตำบลแรกในรายการ
 */
const KEY = "bowon.tambon";

export function readChosenTambonSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("t");
    if (fromQuery && /^[a-z0-9-]{2,40}$/.test(fromQuery)) {
      window.localStorage.setItem(KEY, fromQuery);
      return fromQuery;
    }
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** "ตำบลบุ่งไหม" กับ "นวมินทร์" → แสดงเป็น "ตำบล…" ครั้งเดียว */
export function tambonDisplayName(name: string): string {
  const n = name.trim();
  return n.startsWith("ตำบล") || n.startsWith("แขวง") ? n : `ตำบล${n}`;
}
