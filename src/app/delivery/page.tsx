import type { Metadata } from "next";
import DeliveryLanding from "@/components/DeliveryLanding";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { directoryPage, directorySearch, DIRECTORY_PAGE_SIZE, type DeliveryArea } from "@/lib/delivery-directory";

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
  const page = directoryPage(params.page);
  let areas: DeliveryArea[] = [];
  let total = 0;
  let unavailable = !isSupabaseConfigured();

  if (!unavailable) {
    try {
      const supabase = await createClient();
      let request = supabase.from("tambons")
        .select("id,name,slug,district,province,is_active", { count: "exact" })
        .not("slug", "is", null)
        .order("is_active", { ascending: false })
        .order("name").order("id");
      if (query) request = request.or(`name.ilike.%${query}%,district.ilike.%${query}%,province.ilike.%${query}%`);
      const { data, count, error } = await request.range(
        (page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE - 1,
      );
      unavailable = Boolean(error);
      if (!error) {
        areas = data ?? [];
        total = count ?? 0;
      }
    } catch {
      unavailable = true;
    }
  }

  return <DeliveryLanding areas={areas} total={total} query={query} page={page} unavailable={unavailable} />;
}
