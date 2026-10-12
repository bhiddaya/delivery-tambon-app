export type SoundKind = "merchant" | "driver" | "agent";
/**
 * ความดังสูงสุดที่ส่งเข้าลำโพง (0–1) ที่ ความดัง 100%
 * เดิม 0.2 ทำให้ 100% ดังแค่ 1 ใน 5 ของที่มือถือเล่นได้ และค่าเริ่มต้น 60% เหลือ 0.12 — ร้าน ไรเดอร์ บ่นว่าเบา (12 ต.ค. 2569)
 * 0.9 เผื่อไว้ไม่ให้เสียงแตก โน้ตไม่ซ้อนกัน (ยาว 0.24 วินาที ห่าง 0.32 วินาที)
 */
export const PEAK_GAIN = 0.9;
export type SoundSettings = { tone: "chime" | "pulse" | "bell"; repeats: number; seconds: number; gap: number; volume: number };
export function defaultSound(kind: SoundKind): SoundSettings {
  return { tone: kind === "merchant" ? "chime" : kind === "driver" ? "pulse" : "bell", repeats: 3, seconds: 2, gap: 2, volume: 100 };
}
/** Bound persisted/input values before scheduling audio on the device. */
export function soundSettings(value: unknown, kind: SoundKind): SoundSettings {
  const d = defaultSound(kind);
  if (!value || typeof value !== "object") return d;
  const v = value as Partial<SoundSettings>;
  const number = (x: unknown, fallback: number, min: number, max: number) => typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
  return { tone: v.tone === "chime" || v.tone === "pulse" || v.tone === "bell" ? v.tone : d.tone,
    repeats: number(v.repeats, d.repeats, 1, 10), seconds: number(v.seconds, d.seconds, 1, 10), gap: number(v.gap, d.gap, 1, 30), volume: number(v.volume, d.volume, 10, 100) };
}
export function soundPlan(settings: SoundSettings) {
  const tones = settings.tone === "chime" ? [660, 880, 1100] : settings.tone === "pulse" ? [880, 660] : [1047, 1319, 1568, 1319];
  const pulses: { at: number; frequency: number; duration: number }[] = [];
  for (let round = 0; round < settings.repeats; round++) {
    for (let tick = 0; tick * 0.32 < settings.seconds; tick++) {
      const start = tick * 0.32;
      pulses.push({ at: round * (settings.seconds + settings.gap) + start, frequency: tones[tick % tones.length], duration: Math.min(0.24, settings.seconds - start) });
    }
  }
  return { pulses, duration: settings.repeats * settings.seconds + (settings.repeats - 1) * settings.gap };
}
