import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import type { Database } from "@/lib/types";
import { directoryPage, directorySearch, DIRECTORY_PAGE_SIZE } from "@/lib/delivery-directory";
import { tambonWebLink } from "@/lib/tambon-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public directory only: no user session, admin key, contact details or private columns.
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "ยังโหลดตำบลไม่ได้" }, { status: 503 });
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const params = request.nextUrl.searchParams;
  try {
    const slug = params.get("slug");
    if (slug !== null) {
      if (!slug || slug.length > 200) return NextResponse.json({ error: "ไม่พบตำบล" }, { status: 400 });
      const { data, error } = await db.from("tambons").select("name,slug").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data?.slug) return NextResponse.json({ error: "ไม่พบตำบล" }, { status: 404 });
      const link = tambonWebLink(encodeURIComponent(data.slug));
      const qr = await QRCode.toDataURL(link, { width: 600, margin: 2 });
      return NextResponse.json({ name: data.name, link, qr });
    }
    const query = directorySearch(params.get("q") ?? undefined);
    const page = directoryPage(params.get("page") ?? undefined);
    let rows = db.from("tambons").select("id,name,slug,district,province,is_active", { count: "exact" })
      .not("slug", "is", null).neq("slug", "")
      .order("is_active", { ascending: false }).order("name").order("id");
    if (query) rows = rows.or(`name.ilike.%${query}%,district.ilike.%${query}%,province.ilike.%${query}%`);
    const { data, count, error } = await rows.range((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE - 1);
    if (error) throw error;
    return NextResponse.json({ areas: data ?? [], total: count ?? 0, page, pageSize: DIRECTORY_PAGE_SIZE, query });
  } catch {
    return NextResponse.json({ error: "ยังโหลดตำบลไม่ได้ กรุณาลองใหม่" }, { status: 503 });
  }
}
