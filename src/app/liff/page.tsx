import type { Metadata } from "next";
import LiffRememberedArea from "@/components/LiffRememberedArea";
import Link from "next/link";
import LiffFoodBrowser from "@/components/LiffFoodBrowser";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { tambonDisplayName } from "@/lib/tambon-choice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "สั่งอาหาร — บวรไทย",
  description: "ค้นหาร้านหรืออาหารในตำบลของคุณ ดูรูป ราคา แล้วสั่งได้เลย",
};

type Area = { id: string; name: string; slug: string };
type Shop = { id: string; name: string; category: string | null; tambon_id: string; is_open: boolean };
type Item = { id: string; name: string; price: number; photo_url: string | null; description: string | null; merchant_id: string };

/**
 * หน้าเริ่มต้นของ LIFF — เปิดจากเมนู "สั่งอาหาร" ใน LINE
 * แสดงร้านที่เปิดอยู่แยกตามตำบล (?t=<slug> เพื่อแสดงเฉพาะตำบลเดียว)
 * อ่านด้วยสิทธิ์ anon เสมอ (ไม่ใช้คุกกี้ล็อกอิน) ฐานข้อมูลจึงคืนเฉพาะร้านที่เปิดและไม่ใช่ร้านทดสอบ
 * ลูกค้าทุกคนเห็นรายชื่อเดียวกัน แม้เปิดจากเครื่องที่ผู้ดูแลล็อกอินค้างอยู่ (ไม่งั้นเห็นร้านทดสอบปนมา)
 */
export default async function LiffShopsPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const slug = typeof t === "string" ? t.slice(0, 80) : "";
  let areas: Area[] = [];
  let shops: Shop[] = [];
  let items: Item[] = [];
  let failed = !isSupabaseConfigured();

  if (!failed) {
    try {
      const db = createPublicClient();
      const [areaResult, shopResult, itemResult] = await Promise.all([
        db.from("tambons").select("id,name,slug").eq("is_active", true).not("slug", "is", null).order("name"),
        // ร้านที่ปิดก็แสดง (จาง ๆ ดูเมนูและลองใส่ตะกร้าได้ แต่สั่งไม่ได้) ร้านเปิดขึ้นก่อน
        db.from("merchants").select("id,name,category,tambon_id,is_open").order("is_open", { ascending: false }).order("name"),
        // anon เห็นเฉพาะเมนูพร้อมขาย ไม่พักขาย ของร้านที่เปิด (policy menu_items_select_public_open)
        db.from("menu_items").select("id,name,price,photo_url,description,merchant_id").eq("is_available", true).eq("is_hidden", false).order("name"),
      ]);
      if (areaResult.error || shopResult.error || itemResult.error) throw new Error("load failed");
      areas = areaResult.data ?? [];
      shops = shopResult.data ?? [];
      items = itemResult.data ?? [];
    } catch {
      failed = true;
    }
  }

  const groups = areas
    .filter(area => !slug || area.slug === slug)
    .map(area => ({ area, shops: shops.filter(shop => shop.tambon_id === area.id) }))
    .filter(group => group.shops.length > 0);
  const visibleShops = new Map(groups.flatMap(g => g.shops).map(shop => [shop.id, shop]));

  return (
    <div>
      <LiffRememberedArea areas={areas} shops={shops} slug={slug} />
      <h1 className="font-head text-2xl font-semibold">สั่งอาหาร · ของแห้ง</h1><Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-indigo" href="/liff/register">สมัครลูกค้าใหม่</Link>
      <p className="mt-1 text-sm text-[#5b6478]">เลือกร้านหรือค้นหาสินค้า กด + ใส่ตะกร้า แล้วดูตะกร้าเพื่อสรุปยอดและค่าส่ง</p>
      {failed ? (
        <p role="status" className="mt-6 rounded-2xl bg-[#fbebd6] p-5 text-sm leading-7 text-[#75450f]">ยังโหลดรายชื่อร้านไม่ได้ กรุณาลองใหม่อีกครั้ง</p>
      ) : groups.length === 0 ? (
        <p role="status" className="mt-6 rounded-2xl bg-[#eff1ec] p-5 text-sm leading-7 text-[#5b6478]">ตอนนี้ยังไม่มีร้านในพื้นที่นี้ กลับมาดูใหม่ภายหลังได้</p>
      ) : (
        <LiffFoodBrowser
          groups={groups.map(({ area, shops: list }) => ({ id: area.id, label: tambonDisplayName(area.name), shops: list.map(({ id, name, category, is_open }) => ({ id, name, category, isOpen: is_open })) }))}
          items={items.flatMap(item => {
            const shop = visibleShops.get(item.merchant_id);
            return shop ? [{ id: item.id, name: item.name, price: Number(item.price), photo: item.photo_url, description: item.description, shopId: shop.id, shopName: shop.name, shopOpen: shop.is_open }] : [];
          })}
        />
      )}
    </div>
  );
}
