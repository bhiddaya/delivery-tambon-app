"use client";

import { useEffect, useRef } from "react";
import { useLiff } from "@/components/LiffProvider";

/**
 * เปิด LIFF ในแอป LINE แล้วให้ LINE ขออนุญาตส่งข้อความเข้าแชตตั้งแต่เข้าหน้าแรก (ครั้งเดียวต่อการเปิด)
 * ขอก่อนที่ลูกค้าจะมีตะกร้า เพราะหลังอนุญาต LINE อาจโหลดหน้าใหม่ ไม่งั้นตะกร้าที่เลือกไว้หายกลางทาง
 */
export default function LiffPermissionGate() {
  const { status, isInClient, askChatPermission } = useLiff();
  const asked = useRef(false);

  useEffect(() => {
    if (status !== "ready" || !isInClient || asked.current) return;
    asked.current = true;
    try {
      // ผู้ใช้กดไม่อนุญาตแล้ว ไม่ถามซ้ำทุกครั้งที่เปิดหน้า (ตอนสั่งมีปุ่มสำรองเปิด LINE ให้ส่งเอง)
      if (sessionStorage.getItem("liff-chat-permission-asked")) return;
      sessionStorage.setItem("liff-chat-permission-asked", "1");
    } catch {
      // ใช้ sessionStorage ไม่ได้: ถามครั้งเดียวตามตัวแปร asked ด้านบน
    }
    void askChatPermission();
  }, [status, isInClient, askChatPermission]);

  return null;
}
