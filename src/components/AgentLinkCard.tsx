"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

/** ทางเข้าหลังบ้านสำหรับคนที่ส่วนกลางแต่งตั้งเป็นตัวแทนตำบล แต่บทบาทหลักยังเป็นร้าน/ไรเดอร์/ลูกค้า */
export function AgentLinkCard({ profileId }: { profileId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    createClient()
      .from("admin_scopes")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [profileId]);

  if (count === 0) return null;
  return (
    <Card className="mb-4">
      <div className="font-head font-semibold text-sm mb-1">ท่านเป็นตัวแทนตำบล</div>
      <p className="text-ink-soft text-xs mb-2">ดูแลร้าน ไรเดอร์ ค่าส่ง และโอนเงินของตำบลที่ได้รับแต่งตั้ง</p>
      <Link href="/admin" className="text-indigo font-semibold text-sm">
        เข้าหลังบ้านตัวแทนตำบล
      </Link>
    </Card>
  );
}
