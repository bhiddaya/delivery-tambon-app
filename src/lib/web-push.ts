import { createClient } from "@/lib/supabase/client";

/** Web Push ฝั่งเบราว์เซอร์: ขออนุญาต สมัครรับแจ้งเตือน แล้วบันทึกอุปกรณ์ไว้ที่ฐานข้อมูล (ฟังก์ชัน push_save_subscription) */
export type PushKind = "merchant" | "driver" | "agent";
export type PushState = "unsupported" | "denied" | "off" | "on";
export type PushHelp = "ios-install" | "open-browser" | "none";

/** แอป Android "บวรไทย" เปิดเว็บนี้ใน WebView แล้วให้ FCM token ผ่าน window.BavornthaiApp (แจ้งเตือนมีเสียงของแอปเอง) */
type AppBridge = { fcmToken(): string };
const APP_TOKEN_KEY = "bavornthai-app-push-token";

function appBridge(): AppBridge | null {
  return typeof window === "undefined" ? null : (window as unknown as { BavornthaiApp?: AppBridge }).BavornthaiApp ?? null;
}

export function pushSupported(): boolean {
  if (appBridge()) return true;
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
  const app = appBridge();
  if (app) {
    const token = app.fcmToken();
    return token && localStorage.getItem(APP_TOKEN_KEY) === token ? "on" : "off";
  }
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
  const app = appBridge();
  if (app) {
    const token = app.fcmToken();
    if (!token) return "error"; // แอปยังไม่ได้ token จาก Firebase
    const saved = await createClient().rpc("push_save_app_token", { p_token: token, p_kind: kind, p_user_agent: navigator.userAgent.slice(0, 200) });
    if (saved.error) return "error";
    localStorage.setItem(APP_TOKEN_KEY, token);
    return "on";
  }
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
  const app = appBridge();
  if (app) {
    await createClient().rpc("push_remove_app_token", { p_token: app.fcmToken() });
    localStorage.removeItem(APP_TOKEN_KEY);
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await createClient().rpc("push_remove_subscription", { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
