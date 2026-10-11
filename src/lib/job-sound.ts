export type SoundKind = "merchant" | "driver";
export type SoundSettings = { tone: "chime" | "pulse" | "bell"; repeats: number; seconds: number; gap: number; volume: number };
export function defaultSound(kind: SoundKind): SoundSettings {
  return { tone: kind === "merchant" ? "chime" : "pulse", repeats: 3, seconds: 2, gap: 2, volume: 60 };
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
      pulses.push({ at: round * (settings.seconds + settings.gap) + start, frequency: tones[tick % tones.length], duration: Math.min(0.22, settings.seconds - start) });
    }
  }
  return { pulses, duration: settings.repeats * settings.seconds + (settings.repeats - 1) * settings.gap };
}
