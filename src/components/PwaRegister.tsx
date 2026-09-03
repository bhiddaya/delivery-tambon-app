"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ไม่ต้องแจ้งผู้ใช้ — offline caching เป็นแค่ของเสริม ไม่ใช่ฟีเจอร์หลัก
      });
    }
  }, []);
  return null;
}
