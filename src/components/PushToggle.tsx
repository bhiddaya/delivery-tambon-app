"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useOptionalSession } from "@/lib/session-context";
import { disablePush, enablePush, nameAppDevice, pushState, unsupportedHelp, type PushKind, type PushState } from "@/lib/web-push";

const KIND_TH: Record<PushKind, string> = { merchant: "ร้านค้า", driver: "ไรเดอร์", agent: "ตัวแทน" };

/** แจ้งเตือนของมือถือแม้ปิดหน้า (Web Push) · เสียงเป็นของเครื่อง ตั้งได้ในการตั้งค่ามือถือ */
export default function PushToggle({ kind }: { kind: PushKind }) {
  const [state, setState] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fullName = useOptionalSession()?.profile.full_name;
  useEffect(() => {
    let live = true;
    void pushState().then(next => { if (live) setState(next); });
    return () => { live = false; };
  }, []);
  // แอปบวรไทย: บอกหน้าซ้อมเสียงว่าเครื่องนี้ของใคร (บทบาทขึ้นก่อน ชื่อยาวถูกตัดที่ 40 ตัว)
  useEffect(() => {
    if (state === "on" && fullName) nameAppDevice(`${KIND_TH[kind]}: ${fullName}`);
  }, [state, fullName, kind]);
  async function turnOn() {
    setBusy(true); setFailed(false);
    const result = await enablePush(kind);
    setBusy(false);
    if (result === "error") { setFailed(true); return; }
    setState(result);
  }
  async function turnOff() {
    setBusy(true);
    await disablePush().catch(() => { /* ถอนไม่สำเร็จก็ปล่อยไว้ ครั้งหน้าจะลองใหม่ */ });
    setBusy(false); setState("off");
  }
  if (state === "checking") return null;
  return <div className="mt-3 border-t border-border pt-3">
    {state === "on" && <p className="text-sm font-semibold">แจ้งเตือนแม้ปิดหน้า · เปิดอยู่<span className="block text-xs font-normal text-ink-soft">เสียงเป็นเสียงแจ้งเตือนของมือถือ ตั้งได้ในการตั้งค่าเครื่อง</span></p>}
    {state === "off" && <><p className="mb-2 text-sm font-semibold">แจ้งเตือนแม้ปิดหน้า</p><Button className="w-full" disabled={busy} onClick={() => void turnOn()}>{busy ? "กำลังเปิด…" : "เปิดแจ้งเตือนแม้ปิดหน้า"}</Button></>}
    {state === "denied" && <p role="status" className="text-xs leading-6 text-clay">แจ้งเตือนถูกบล็อกไว้ เปิดที่การตั้งค่าเบราว์เซอร์ → การแจ้งเตือน → อนุญาตเว็บนี้ แล้วกลับมากดใหม่</p>}
    {state === "unsupported" && <p role="status" className="text-xs leading-6 text-ink-soft">{unsupportedHelp(typeof navigator === "undefined" ? "" : navigator.userAgent) === "ios-install"
      ? "iPhone: กดปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอนนั้น จึงจะรับแจ้งเตือนแม้ปิดหน้าได้"
      : "เบราว์เซอร์นี้ (เช่นเบราว์เซอร์ในแอป LINE) รับแจ้งเตือนแม้ปิดหน้าไม่ได้ เปิดหน้านี้ใน Chrome แล้วลองใหม่"}</p>}
    {state === "on" && <Button variant="ghost" className="mt-2" disabled={busy} onClick={() => void turnOff()}>ปิดแจ้งเตือนแม้ปิดหน้า</Button>}
    {failed && <p role="status" className="mt-2 text-xs text-clay">เปิดไม่สำเร็จ ลองอีกครั้ง (ถ้ายังไม่ได้ แจ้งผู้ดูแล)</p>}
  </div>;
}
