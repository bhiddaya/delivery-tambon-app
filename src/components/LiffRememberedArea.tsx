"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLineSession } from "@/lib/use-line-session";
/** The server list stays public. Only this account's remembered area changes navigation. */
export default function LiffRememberedArea({ areas, shops, slug }: { areas: { id: string; slug: string }[]; shops: { id: string; tambon_id: string }[]; slug: string }) {
  const session = useLineSession();
  const router = useRouter();
  useEffect(() => {
    if (!session.ready || !session.profile?.tambon_id) return;
    const area = slug ? areas.find(t => t.slug === slug) : areas.find(t => t.id === session.profile?.tambon_id);
    if (!area) return;
    // ไม่พาเข้าหน้าร้านอัตโนมัติแม้ตำบลมีร้านเดียว ลูกค้าเห็นช่องค้นหาและการ์ดอาหารเสมอ (อาจารย์สั่ง 12 ต.ค. 2569)
    // พาไปตำบลที่จำไว้เฉพาะเมื่อตำบลนั้นมีร้าน ไม่งั้นบัญชีที่ตำบลยังไม่มีร้าน (เช่น ผู้ดูแล) ติดหน้าว่าง สั่งตำบลอื่นไม่ได้
    if (!slug && shops.some(s => s.tambon_id === area.id)) router.replace(`/liff?t=${encodeURIComponent(area.slug)}`);
  }, [session.ready, session.profile, areas, shops, slug, router]);
  return null;
}
