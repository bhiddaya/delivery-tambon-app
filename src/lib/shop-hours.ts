export type ShopDay = { enabled: boolean; open: string; close: string };
export type ShopHours = ShopDay[];
export const DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export function defaultHours(): ShopHours {
  return DAY_NAMES.map(() => ({ enabled: true, open: "08:00", close: "17:00" }));
}
export function validHours(value: unknown): value is ShopHours {
  return Array.isArray(value) && value.length === 7 && value.every(day =>
    day && typeof day.enabled === "boolean" && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.open) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(day.close) && (!day.enabled || day.open !== day.close));
}
/** Matching the database rule: Bangkok time; an overnight period belongs to its starting day. */
export function openAt(manuallyOpen: boolean, enabled: boolean, hours: unknown, now: Date): boolean {
  if (!manuallyOpen) return false;
  if (!enabled) return true;
  if (!validHours(hours)) return false;
  const thai = new Date(now.getTime() + 7 * 3600_000);
  const day = thai.getUTCDay();
  const time = `${String(thai.getUTCHours()).padStart(2, "0")}:${String(thai.getUTCMinutes()).padStart(2, "0")}`;
  const today = hours[day], yesterday = hours[(day + 6) % 7];
  return Boolean((today.enabled && (today.open < today.close ? time >= today.open && time < today.close : time >= today.open)) ||
    (yesterday.enabled && yesterday.open > yesterday.close && time < yesterday.close));
}
