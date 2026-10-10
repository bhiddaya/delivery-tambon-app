import type { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

type Db = ReturnType<typeof createClient>;

/** null = หน้าสาธารณะ (ยังไม่ล็อกอิน) ต้องขอเฉพาะคอลัมน์ที่ anon อ่านได้ ไม่งั้นฐานข้อมูลปฏิเสธทั้งคำขอ */
export type ShopScope = { tambonId: string | null; isTest: boolean } | null;

export type ShopInfo = Pick<Tables<"merchants">, "id" | "name" | "category" | "tambon_id" | "is_open"> & { address: string | null };
export type AreaInfo = Pick<Tables<"tambons">, "id" | "name" | "slug" | "is_active" | "delivery_fee_base" | "delivery_fee_per_km"> & { intake_blocked: boolean };
export type ShopPage = { shop: ShopInfo | null; menu: Tables<"menu_items">[]; area: AreaInfo | null };

const NO_TAMBON = "00000000-0000-0000-0000-000000000000";

// คอลัมน์ที่หน้าสาธารณะอ่านไม่ได้ (address, intake_blocked) จึงไม่มีในแถวที่ได้กลับมา
type MerchantRow = Pick<Tables<"merchants">, "id" | "name" | "category" | "tambon_id" | "is_open"> & { address?: string | null };
type AreaRow = Pick<Tables<"tambons">, "id" | "name" | "slug" | "is_active" | "delivery_fee_base" | "delivery_fee_per_km"> & { intake_blocked?: boolean };

export async function loadShopPage(db: Db, id: string, scope: ShopScope): Promise<ShopPage> {
  const found = scope
    ? await db.from("merchants").select("*").eq("id", id).eq("tambon_id", scope.tambonId ?? NO_TAMBON).eq("is_test", scope.isTest).maybeSingle()
    : await db.from("merchants").select("id,name,category,tambon_id,is_open").eq("id", id).maybeSingle();
  if (found.error) throw new Error("shop unavailable");
  const row = found.data as MerchantRow | null;
  if (!row) return { shop: null, menu: [], area: null };
  const shop: ShopInfo = { id: row.id, name: row.name, category: row.category, tambon_id: row.tambon_id, is_open: row.is_open, address: row.address ?? null };

  const [menu, areaResult] = await Promise.all([
    db.from("menu_items").select("*").eq("merchant_id", id).eq("is_hidden", false).order("name"),
    scope
      ? db.from("tambons").select("id,name,slug,is_active,intake_blocked,delivery_fee_base,delivery_fee_per_km").eq("id", row.tambon_id).maybeSingle()
      : db.from("tambons").select("id,name,slug,is_active,delivery_fee_base,delivery_fee_per_km").eq("id", row.tambon_id).maybeSingle(),
  ]);
  if (menu.error || areaResult.error) throw new Error("shop details unavailable");
  const a = areaResult.data as AreaRow | null;
  const area: AreaInfo | null = a ? { id: a.id, name: a.name, slug: a.slug, is_active: a.is_active, delivery_fee_base: a.delivery_fee_base, delivery_fee_per_km: a.delivery_fee_per_km, intake_blocked: a.intake_blocked ?? false } : null;
  return { shop, menu: menu.data ?? [], area };
}
