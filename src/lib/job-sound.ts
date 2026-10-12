export type SoundKind = "merchant" | "driver" | "agent";
/**
 * ความดังสูงสุดที่ส่งเข้าลำโพง (0–1) ที่ ความดัง 100%
 * เดิม 0.2 ทำให้ 100% ดังแค่ 1 ใน 5 ของที่มือถือเล่นได้ และค่าเริ่มต้น 60% เหลือ 0.12 — ร้าน ไรเดอร์ บ่นว่าเบา (12 ต.ค. 2569)
 * 0.9 เผื่อไว้ไม่ให้เสียงแตก โน้ตไม่ซ้อนกัน
 */
export const PEAK_GAIN = 0.9;
/** ข้อความเสียงพูด (อาจารย์ขอ 12 ต.ค. 2569) — อ่านด้วยเสียงภาษาไทยของเครื่อง */
export const VOICE_TEXT = "บวรไทยมาแล้ว";

/**
 * voice   = แตร 1 ชุด แล้วตามด้วยเสียงพูด "บวรไทยมาแล้ว" (ค่าเริ่มต้น)
 * fanfare = แตรเป็นจังหวะ ติ๊ด ติ๊ด ติ๊ด ตู๊ด ซ้ำจนเต็มรอบ (คลื่นสี่เหลี่ยม ได้ยินชัดกว่าเสียงหวาน)
 */
export type SoundTone = "voice" | "fanfare" | "chime" | "pulse" | "bell";
const TONES: SoundTone[] = ["voice", "fanfare", "chime", "pulse", "bell"];
export type SoundSettings = { tone: SoundTone; repeats: number; seconds: number; gap: number; volume: number };
export function defaultSound(kind: SoundKind): SoundSettings {
  void kind; // ทุกบทบาทใช้เสียงเดียวกันตามที่อาจารย์ขอ ยังรับ kind ไว้ให้ปรับแยกได้ภายหลัง
  return { tone: "voice", repeats: 3, seconds: 3, gap: 2, volume: 100 };
}
/** Bound persisted/input values before scheduling audio on the device. */
export function soundSettings(value: unknown, kind: SoundKind): SoundSettings {
  const d = defaultSound(kind);
  if (!value || typeof value !== "object") return d;
  const v = value as Partial<SoundSettings>;
  const number = (x: unknown, fallback: number, min: number, max: number) => typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
  return { tone: TONES.includes(v.tone as SoundTone) ? v.tone as SoundTone : d.tone,
    repeats: number(v.repeats, d.repeats, 1, 10), seconds: number(v.seconds, d.seconds, 1, 10), gap: number(v.gap, d.gap, 1, 30), volume: number(v.volume, d.volume, 10, 100) };
}

export type SoundPulse = { at: number; frequency: number; duration: number; wave: OscillatorType };
/** ติ๊ด ติ๊ด ติ๊ด ตู๊ด: [เริ่ม (วินาที), ความถี่, ยาว] */
const FANFARE: [number, number, number][] = [[0, 784, 0.12], [0.16, 784, 0.12], [0.32, 784, 0.12], [0.48, 1047, 0.5]];
const FANFARE_LENGTH = 1.1;

export function soundPlan(settings: SoundSettings) {
  const pulses: SoundPulse[] = [];
  const speakAt: number[] = [];
  for (let round = 0; round < settings.repeats; round++) {
    const roundStart = round * (settings.seconds + settings.gap);
    if (settings.tone === "fanfare" || settings.tone === "voice") {
      const sets = settings.tone === "voice" ? 1 : Math.max(1, Math.floor(settings.seconds / FANFARE_LENGTH));
      for (let s = 0; s < sets; s++) {
        for (const [at, frequency, duration] of FANFARE) pulses.push({ at: roundStart + s * FANFARE_LENGTH + at, frequency, duration, wave: "square" });
      }
      if (settings.tone === "voice") speakAt.push(roundStart + FANFARE_LENGTH);
      continue;
    }
    const tones = settings.tone === "chime" ? [660, 880, 1100] : settings.tone === "pulse" ? [880, 660] : [1047, 1319, 1568, 1319];
    for (let tick = 0; tick * 0.32 < settings.seconds; tick++) {
      const start = tick * 0.32;
      pulses.push({ at: roundStart + start, frequency: tones[tick % tones.length], duration: Math.min(0.24, settings.seconds - start), wave: settings.tone === "pulse" ? "triangle" : "sine" });
    }
  }
  return { pulses, speakAt, duration: settings.repeats * settings.seconds + (settings.repeats - 1) * settings.gap };
}
