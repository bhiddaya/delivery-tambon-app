import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { tambonDisplayName } from "@/lib/tambon-choice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "สั่งอาหาร — บวรไทย",
  description: "เลือกร้านที่เปิดอยู่ในตำบลของคุณ ดูเมนู รูป ราคา แล้วสั่งได้เลย",
};

type Area = { id: string; name: string; slug: string };
type Shop = { id: string; name: string; category: string | null; tambon_id: string };

/**
 * หน้าเริ่มต้นของ LIFF — เปิดจากเมนู "สั่งอาหาร" ใน LINE
 * แสดงร้านที่เปิดอยู่แยกตามตำบล (?t=<slug> เพื่อแสดงเฉพาะตำบลเดียว)
 * อ่านด้วยสิทธิ์ของผู้ที่ยังไม่ล็อกอิน (anon) ฐานข้อมูลคืนเฉพาะร้านที่เปิดและไม่ใช่ร้านทดสอบ
 */
export default async function LiffShopsPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const slug = typeof t === "string" ? t.slice(0, 80) : "";
  let areas: Area[] = [];
  let shops: Shop[] = [];
  let failed = !isSupabaseConfigured();

  if (!failed) {
    try {
      const db = await createClient();
      const [areaResult, shopResult] = await Promise.all([
        db.from("tambons").select("id,name,slug").eq("is_active", true).not("slug", "is", null).order("name"),
        db.from("merchants").select("id,name,category,tambon_id").eq("is_open", true).order("name"),
      ]);
      if (areaResult.error || shopResult.error) throw new Error("load failed");
      areas = areaResult.data ?? [];
      shops = shopResult.data ?? [];
    } catch {
      failed = true;
    }
  }

  const groups = areas
    .filter(area => !slug || area.slug === slug)
    .map(area => ({ area, shops: shops.filter(shop => shop.tambon_id === area.id) }))
    .filter(group => group.shops.length > 0);

  return (
    <div>
      <h1 className="font-head text-2xl font-semibold">สั่งอาหาร</h1>
      <p className="mt-1 text-sm text-[#5b6478]">เลือกร้านที่เปิดอยู่ ดูเมนู รูป ราคา แล้วสั่งได้เลย</p>
      {failed ? (
        <p role="status" className="mt-6 rounded-2xl bg-[#fbebd6] p-5 text-sm leading-7 text-[#75450f]">ยังโหลดรายชื่อร้านไม่ได้ กรุณาลองใหม่อีกครั้ง</p>
      ) : groups.length === 0 ? (
        <p role="status" className="mt-6 rounded-2xl bg-[#eff1ec] p-5 text-sm leading-7 text-[#5b6478]">ตอนนี้ยังไม่มีร้านเปิดรับออเดอร์ในพื้นที่นี้ กลับมาดูใหม่ภายหลังได้</p>
      ) : (
        groups.map(({ area, shops: list }) => (
          <section key={area.id} className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-[#5b6478]">{tambonDisplayName(area.name)}</h2>
            <div className="divide-y divide-[#e7e9e1] overflow-hidden rounded-2xl border border-[#dbdfd5] bg-white">
              {list.map(shop => (
                <Link key={shop.id} href={`/liff/shop/${encodeURIComponent(shop.id)}`} className="flex items-center gap-3 px-4 py-4 active:bg-[#f3f4f8]">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#e4e7f0] text-[#2e3e68]"><Store size={22} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{shop.name}</span>
                    {shop.category && <span className="block text-xs text-[#5b6478]">{shop.category}</span>}
                  </span>
                  <span className="flex flex-none items-center text-sm font-semibold text-[#2e3e68]">ดูเมนู<ChevronRight size={18} aria-hidden="true" /></span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
