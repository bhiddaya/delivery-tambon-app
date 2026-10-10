import type { Metadata } from "next";
import DeliveryLanding from "@/components/DeliveryLanding";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { directoryPage, directorySearch, DIRECTORY_PAGE_SIZE, type DeliveryArea, type PublicDeliveryShop } from "@/lib/delivery-directory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "บวรไทย Delivery — ใกล้บ้าน ส่งถึงมือ",
  description: "ค้นหาตำบลของคุณ สั่งอาหารและของใช้จากร้านในชุมชนผ่านบวรไทย พร้อมข่าวชุมชนและช่องทางสมัครร้านค้า ไรเดอร์ และตัวแทนตำบล",
};

export default async function DeliveryPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = directorySearch(params.q);
  let page = directoryPage(params.page);
  let areas: DeliveryArea[] = [];
  let total = 0;
  let shops: PublicDeliveryShop[] = [];
  let shopsUnavailable = false;
  let unavailable = !isSupabaseConfigured();

  if (!unavailable) {
    try {
      const supabase = await createClient();
      const areaQuery = () => {
        let request = supabase.from("tambons")
          .select("id,name,slug,district,province,is_active", { count: "exact" })
          .not("slug", "is", null)
          .order("is_active", { ascending: false })
          .order("name").order("id");
        if (query) request = request.or(`name.ilike.%${query}%,district.ilike.%${query}%,province.ilike.%${query}%`);
        return request;
      };
      let { data, count, error } = await areaQuery().range(
        (page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE - 1,
      );
      // A page past the last one makes PostgREST answer PGRST103; show page 1 instead of a load error
      if (error?.code === "PGRST103" && page > 1) {
        page = 1;
        ({ data, count, error } = await areaQuery().range(0, DIRECTORY_PAGE_SIZE - 1));
      }
      unavailable = Boolean(error);
      if (!error) {
        areas = data ?? [];
        total = count ?? 0;
        if (areas.length) {
          // Only columns granted to anonymous visitors. Never enrich with admin access.
          const stores = await supabase.from("merchants").select("id,name,category,tambon_id,is_open")
            .in("tambon_id", areas.map(t => t.id)).eq("is_open", true).order("name").limit(12);
          shopsUnavailable = Boolean(stores.error);
          if (!stores.error) shops = stores.data ?? [];
        }
      }
    } catch {
      unavailable = true;
    }
  }

  return <DeliveryLanding areas={areas} total={total} query={query} page={page} unavailable={unavailable} shops={shops} shopsUnavailable={shopsUnavailable || unavailable} />;
}
