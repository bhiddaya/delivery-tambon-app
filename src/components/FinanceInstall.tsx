"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export default function FinanceInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const online = () => setOffline(!navigator.onLine);
    online(); window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("online", online); window.addEventListener("offline", online);
    return () => { window.removeEventListener("beforeinstallprompt", install); window.removeEventListener("online", online); window.removeEventListener("offline", online); };
  }, []);
  return <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
    <p className="text-sm font-semibold">การเงินสำหรับตัวแทนตำบล</p>
    <p className="mt-1 text-xs leading-6 text-ink-soft">ติดตั้งไว้หน้าจอหลักได้ · ตรวจเงินจริงก่อนยืนยัน · ระบบไม่เก็บหน้าการเงินไว้ใช้งานออฟไลน์</p>
    {prompt ? <Button className="mt-3" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>ติดตั้งแอปการเงิน</Button> : <details className="mt-2 text-xs leading-6"><summary className="cursor-pointer text-indigo">วิธีเพิ่มไว้หน้าจอหลัก</summary><p>Android: เปิดด้วย Chrome → เมนู ⋮ → ติดตั้งแอป / เพิ่มในหน้าจอหลัก<br />iPhone: เปิดด้วย Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม<br />หากเปิดใน LINE ให้เลือกเปิดด้วยเบราว์เซอร์เพื่อติดตั้งครั้งแรก</p></details>}
    {offline && <p role="alert" className="mt-2 text-sm text-clay">ออฟไลน์อยู่ กรุณาต่ออินเทอร์เน็ตก่อนตรวจและบันทึกการเงิน</p>}
  </div>;
}
