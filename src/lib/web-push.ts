import { createClient } from "@/lib/supabase/client";

/** Web Push ฝั่งเบราว์เซอร์: ขออนุญาต สมัครรับแจ้งเตือน แล้วบันทึกอุปกรณ์ไว้ที่ฐานข้อมูล (ฟังก์ชัน push_save_subscription) */
export type PushKind = "merchant" | "driver" | "agent";
export type PushState = "unsupported" | "denied" | "off" | "on";
export type PushHelp = "ios-install" | "open-browser" | "none";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** ไม่รองรับเพราะอะไร: iPhone ต้องติดตั้งลงหน้าจอหลักก่อน · เบราว์เซอร์ในแอป LINE ไม่รองรับ ให้เปิดใน Chrome */
export function unsupportedHelp(userAgent: string): PushHelp {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios-install";
  return "open-browser";
}

export function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription && Notification.permission === "granted" ? "on" : "off";
  } catch { return "off"; }
}

/** เปิดแจ้งเตือน: ต้องเรียกจากการกดของผู้ใช้ (เบราว์เซอร์บังคับ) */
export async function enablePush(kind: PushKind): Promise<PushState | "error"> {
  if (!pushSupported()) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  try {
    const db = createClient();
    const registration = await navigator.serviceWorker.ready;
    const key = await db.rpc("push_public_key");
    if (key.error || !key.data) return "error"; // ยังไม่ได้สร้างกุญแจฝั่งเซิร์ฟเวอร์
    const subscription = (await registration.pushManager.getSubscription())
      ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key.data) as BufferSource }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return "error";
    const saved = await db.rpc("push_save_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_kind: kind, p_user_agent: navigator.userAgent.slice(0, 200) });
    return saved.error ? "error" : "on";
  } catch { return "error"; }
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await createClient().rpc("push_remove_subscription", { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
