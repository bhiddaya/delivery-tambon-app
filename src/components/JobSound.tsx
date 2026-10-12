"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { PEAK_GAIN, VOICE_TEXT, defaultSound, soundPlan, soundSettings, type SoundKind, type SoundSettings } from "@/lib/job-sound";

/** เสียงพูดภาษาไทยของเครื่อง · เบราว์เซอร์ LINE บางรุ่นไม่มี — แตรยังดังตามปกติ */
function speak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(VOICE_TEXT);
  u.lang = "th-TH"; u.rate = 1.05; u.pitch = 1.2; u.volume = 1;
  const thai = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith("th"));
  if (thai) u.voice = thai;
  window.speechSynthesis.speak(u);
  return true;
}

const KIND_LABEL: Record<SoundKind, string> = { merchant: "เสียงงานใหม่ · ร้านค้า", driver: "เสียงงานใหม่ · ไรเดอร์", agent: "เสียงสลิปใหม่รอตรวจ · ตัวแทนตำบล" };

/** Foreground audio needs a user gesture; background LINE sound is controlled by the device. */
export default function JobSound({ ids, scope, kind, streamScope = scope }: { ids: number[] | null; scope: string; kind: SoundKind; streamScope?: string }) {
  const [settings, setSettings] = useState(() => defaultSound(kind));
  const [enabled, setEnabled] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [failed, setFailed] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const nodes = useRef<OscillatorNode[]>([]);
  const timer = useRef<number | null>(null);
  const speechTimers = useRef<number[]>([]);
  const [noVoice, setNoVoice] = useState(false);
  const previous = useRef<{ scope: string; ids: Set<number> } | null>(null);
  // v2 (12 ต.ค. 2569): เสียงใหม่ แตร + บวรไทยมาแล้ว — เปลี่ยนกุญแจให้ทุกเครื่องเริ่มที่ค่าใหม่
  const key = `job-sound:v2:${kind}:${scope}`;
  useEffect(() => {
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { /* optional storage */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate device preferences after mount
    setSettings(soundSettings(saved, kind));
  }, [key, kind]);
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    for (const tone of nodes.current) { try { tone.stop(); } catch { /* already ended */ } tone.disconnect(); }
    for (const t of speechTimers.current) window.clearTimeout(t);
    speechTimers.current = [];
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    nodes.current = [];
    setRinging(false);
  }, []);
  const ring = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") { setFailed(true); return; }
    stop();
    const plan = soundPlan(settings);
    // ตัวบีบเสียง: ยกเสียงเบาขึ้นและกันเสียงแตก ทำให้ดังขึ้นโดยรวม
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -18; out.knee.value = 6; out.ratio.value = 6; out.attack.value = 0.003; out.release.value = 0.1;
    out.connect(ctx.destination);
    for (const pulse of plan.pulses) {
      const tone = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + 0.02 + pulse.at;
      tone.type = pulse.wave;
      tone.frequency.value = pulse.frequency;
      gain.gain.setValueAtTime(0.001, start);
      // คลื่นสี่เหลี่ยมดังกว่าคลื่นไซน์มาก ลดลงครึ่งหนึ่งก่อนเข้าตัวบีบเสียง
      gain.gain.exponentialRampToValueAtTime(settings.volume / 100 * PEAK_GAIN * (pulse.wave === "square" ? 0.5 : 1), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + pulse.duration);
      tone.connect(gain); gain.connect(out);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(start); tone.stop(start + pulse.duration);
      nodes.current.push(tone);
    }
    for (const at of plan.speakAt) speechTimers.current.push(window.setTimeout(() => { if (!speak()) setNoVoice(true); }, (at + 0.05) * 1000));
    setRinging(true); setFailed(false);
    timer.current = window.setTimeout(() => { nodes.current = []; timer.current = null; setRinging(false); }, (plan.duration + 0.1) * 1000);
  }, [settings, stop]);
  async function activate() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setEnabled(true); ring();
    } catch { setFailed(true); }
  }
  function change(patch: Partial<SoundSettings>) {
    stop();
    const next = soundSettings({ ...settings, ...patch }, kind);
    setSettings(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* optional storage */ }
  }
  useEffect(() => {
    if (ids === null) { previous.current = null; return; }
    const old = previous.current;
    previous.current = { scope: streamScope, ids: new Set(ids) };
    if (enabled && old?.scope === streamScope && ids.some(id => !old.ids.has(id)) && document.visibilityState === "visible") ring();
  }, [ids, enabled, streamScope, ring]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState !== "visible") stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); stop(); void audio.current?.close(); audio.current = null; };
  }, [stop]);
  return <div className="mb-4 rounded-xl border border-border bg-surface p-3">
    <p className="mb-2 text-sm font-semibold">{KIND_LABEL[kind]}</p>
    <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { if (enabled) { stop(); setEnabled(false); } else void activate(); }}>{enabled ? "ปิดเสียงงานใหม่" : "เปิดเสียงงานใหม่"}</Button><Button variant="ghost" onClick={activate}>ทดลองเสียง</Button><Button variant="ghost" disabled={!ringing} onClick={stop}>หยุดเสียงรอบนี้</Button></div>
    <details className="mt-2"><summary className="min-h-11 cursor-pointer text-sm text-indigo">ตั้งเสียง จำนวนครั้ง และระยะเวลา</summary>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm"><label>โทนเสียง<select className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-2" value={settings.tone} onChange={e => change({ tone: e.target.value as SoundSettings["tone"] })}><option value="voice">แตร + พูด &quot;บวรไทยมาแล้ว&quot;</option><option value="fanfare">แตรเร้าใจ · ติ๊ด ติ๊ด ติ๊ด ตู๊ด</option><option value="chime">เสียงร้าน · ไล่โน้ต</option><option value="pulse">เสียงไรเดอร์ · สองจังหวะ</option><option value="bell">เสียงระฆัง</option></select></label>
      {([{ field: "repeats", label: "เตือนกี่ครั้ง", min: 1, max: 10 }, { field: "seconds", label: "ครั้งละ (วินาที)", min: 1, max: 10 }, { field: "gap", label: "เว้นช่วง (วินาที)", min: 1, max: 30 }] as const).map(f => <label key={f.field}>{f.label}<input className="mt-1 min-h-11 w-full rounded-lg border border-border px-2" type="number" min={f.min} max={f.max} value={settings[f.field]} onChange={e => change({ [f.field]: Number(e.target.value) })} /></label>)}</div>
      <label className="mt-3 block text-sm">ความดัง {settings.volume}%<input className="mt-2 min-h-11 w-full" type="range" min={10} max={100} step={10} value={settings.volume} onChange={e => change({ volume: Number(e.target.value) })} /></label>
    </details>
    <p className="mt-2 text-xs leading-6 text-ink-soft">เตือน {settings.repeats} ครั้ง · ครั้งละ {settings.seconds} วินาที · เว้น {settings.gap} วินาที จำค่าบนเครื่องนี้ แตะเปิดเสียงทุกครั้งที่เข้าหน้างาน เสียงดังเมื่อเปิดหน้านี้อยู่ ส่วนแจ้งเตือนเมื่อปิดหน้าใช้ LINE และเสียงที่ตั้งในมือถือ · ยังเบา: เพิ่มเสียงสื่อ (Media) ของมือถือและปิดโหมดเงียบ</p>
    {noVoice && <p role="status" className="text-xs text-ink-soft">เบราว์เซอร์นี้พูดภาษาไทยไม่ได้ จึงได้ยินแต่เสียงแตร ถ้าอยากได้เสียงพูด เปิดหน้านี้ใน Chrome</p>}
    {failed && <p role="status" className="text-xs text-clay">ยังเล่นเสียงไม่ได้ ลองแตะเปิดเสียงอีกครั้งและตรวจระดับเสียงมือถือ</p>}
  </div>;
}
