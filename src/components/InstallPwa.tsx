"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPwa() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setHelpOpen(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (window.matchMedia("(display-mode: standalone)").matches || installed) {
      setInstalled(true);
      return;
    }
    if (!installEvent) { setHelpOpen(!helpOpen); return; }
    setBusy(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setHelpOpen(true);
    } finally {
      setInstallEvent(null);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-[#dbdfd5] bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-[#e4e7f0] p-3 text-[#2e3e68]"><Smartphone size={26} aria-hidden="true" /></span>
          <div><h3 className="text-xl font-semibold">บวรไทย ติดไว้หน้าจอมือถือ</h3>
            <p className="mt-1 max-w-lg text-sm leading-7 text-[#5b6478]">เปิดง่ายเหมือนแอป ไม่ต้องดาวน์โหลดจากสโตร์ สั่งและติดตามงานเมื่อเชื่อมต่ออินเทอร์เน็ต</p></div>
        </div>
        <button type="button" onClick={install} disabled={busy || installed} aria-expanded={helpOpen} aria-controls="pwa-help"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#2e3e68] px-5 font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2e3e68]">
          <Download size={18} aria-hidden="true" />{installed ? "ติดตั้งแล้ว" : busy ? "กำลังเปิดการติดตั้ง…" : "ติดตั้งแอป"}
        </button>
      </div>
      {helpOpen && <div id="pwa-help" className="relative mt-5 rounded-2xl bg-[#eff1ec] p-5 pr-14 text-sm leading-7" role="region" aria-label="วิธีติดตั้งบวรไทย">
        <button type="button" onClick={() => setHelpOpen(false)} aria-label="ปิดวิธีติดตั้ง" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white"><X size={18} /></button>
        <p><strong>Android / Chrome:</strong> เปิดเมนู ⋮ แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”</p>
        <p className="mt-2"><strong>iPhone / Safari:</strong> กดปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</p>
        <p className="mt-2 text-[#5b6478]">หากเปิดใน LINE ให้เปิดลิงก์ด้วยเบราว์เซอร์ของมือถือก่อนติดตั้ง</p>
      </div>}
    </div>
  );
}
