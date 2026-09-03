import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import SetupRequired from "@/components/SetupRequired";
import { Card, EmptyState } from "@/components/ui";

/**
 * หน้าสาธารณะของตำบล — /t/<slug>
 *
 * เปิดดูได้โดยไม่ต้องล็อกอิน เพื่อให้แชร์ลิงก์และให้ Google เก็บได้
 *
 * อ่านด้วยสิทธิ์สาธารณะ (anon) ไม่ใช่ service role — หน้านี้จึงไม่ต้องพึ่ง
 * secret key ใด ๆ ความปลอดภัยคุมที่ฐานข้อมูลแทน:
 *   - RLS ปล่อยเฉพาะร้านที่ is_open = true
 *   - GRANT ระดับคอลัมน์ ปิด merchants.profile_id และ tambons.note ไม่ให้ anon เห็น
 * ดู supabase/migrations/20260903_public_read_tambon_directory.sql
 *
 * ตั้งเป็น dynamic ไว้ก่อน: ถ้าปล่อยให้ prerender ตอน build ที่ยังไม่มี
 * environment variables จะได้หน้า "ยังตั้งค่าไม่เสร็จ" ติดแคชไปเลย
 * เปิด ISR ทีหลังได้เมื่อ deploy มี env ครบแล้ว
 */
export const dynamic = "force-dynamic";

type TambonPublic = {
  id: string;
  name: string;
  district: string | null;
  province: string | null;
};

type MerchantPublic = {
  id: string;
  name: string;
  category: string | null;
};

async function getTambon(slug: string): Promise<TambonPublic | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tambons")
    .select("id, name, district, province")
    .eq("slug", slug)
    .maybeSingle();

  // แยก "ไม่มีตำบลนี้" ออกจาก "ต่อฐานข้อมูลไม่ได้" ให้ชัด
  //
  // เดิมกลืน error แล้วคืน null ทั้งสองกรณี ทำให้ปัญหาการตั้งค่า
  // (เช่น anon key ไม่ถูกฝังลง build) โผล่มาเป็นหน้า 404 เฉย ๆ
  // ซึ่งชี้ไปผิดทางหมด — เสียเวลาไล่หาสาเหตุนาน
  if (error) {
    console.error("[/t/%s] tambon lookup failed:", slug, error.message);
    throw new Error(`Cannot reach the database: ${error.message}`);
  }

  return (data as TambonPublic | null) ?? null;
}

/**
 * ตัดคำนำหน้าที่ข้อมูลเก็บมาแล้ว ก่อนเติมคำนำหน้าของเราเอง
 *
 * ตาราง tambons เก็บชื่อแบบเต็ม ("ตำบลบุ่งไหม", "อำเภอเมือง") แต่บางแถว
 * อาจเก็บแบบสั้น ("บุ่งไหม") ถ้าเติมคำนำหน้าดื้อ ๆ จะได้ "ตำบลตำบลบุ่งไหม"
 * รองรับรูปแบบกรุงเทพฯ (แขวง/เขต) ด้วย เพราะโครงการครอบคลุมทั้งแขวงและตำบล
 */
function stripPrefix(value: string, prefixes: string[]): string {
  for (const p of prefixes) {
    if (value.startsWith(p)) return value.slice(p.length).trim();
  }
  return value.trim();
}

function tambonLabel(t: TambonPublic): string {
  const bare = stripPrefix(t.name, ["ตำบล", "ต.", "แขวง"]);
  const isBangkokStyle = t.name.startsWith("แขวง");
  return `${isBangkokStyle ? "แขวง" : "ตำบล"}${bare}`;
}

function fullPlace(t: TambonPublic): string {
  const district = t.district
    ? `${t.district.startsWith("เขต") ? "เขต" : "อ."}${stripPrefix(t.district, ["อำเภอ", "อ.", "เขต"])}`
    : null;
  // กรุงเทพฯ ไม่ใช่จังหวัด จึงไม่ใส่ "จ." นำหน้า
  const bareProvince = t.province ? stripPrefix(t.province, ["จังหวัด", "จ."]) : null;
  const province = bareProvince
    ? bareProvince.startsWith("กรุงเทพ")
      ? bareProvince
      : `จ.${bareProvince}`
    : null;

  return [district, province].filter(Boolean).join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "ตำบล" };

  const { slug } = await params;

  let tambon: TambonPublic | null = null;
  try {
    tambon = await getTambon(slug);
  } catch {
    return { title: "ตำบล" }; // metadata ไม่ควรทำให้ทั้งหน้าล่ม
  }

  if (!tambon) return { title: "ไม่พบตำบลนี้" };

  const place = fullPlace(tambon);
  const title = `${tambonLabel(tambon)}${place ? ` ${place}` : ""}`;

  return {
    title,
    description: `สั่งอาหาร ส่งของ เรียกรถ ภายใน${tambonLabel(tambon)} — บวรไทย`,
    openGraph: { title, type: "website" },
  };
}

export default async function TambonPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { slug } = await params;
  const tambon = await getTambon(slug);

  if (!tambon) notFound();

  const supabase = await createClient();
  const { data: merchantRows, error: merchantError } = await supabase
    .from("merchants")
    .select("id, name, category")
    .eq("tambon_id", tambon.id)
    .eq("is_open", true)
    .order("name");

  // รายชื่อร้านพลาดไม่ควรทำให้ทั้งหน้าล่ม — แสดงหน้าตำบลไว้ แล้วบอกว่าโหลดร้านไม่ได้
  if (merchantError) {
    console.error("[/t/%s] merchant list failed:", slug, merchantError.message);
  }

  const merchants = (merchantRows ?? []) as MerchantPublic[];
  const place = fullPlace(tambon);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <p className="text-ink-soft text-xs">บวรไทย · ระบบส่งของระดับตำบล</p>
        <h1 className="text-2xl font-head font-bold mt-1">{tambonLabel(tambon)}</h1>
        {place && <p className="text-ink-soft text-sm mt-0.5">{place}</p>}
      </header>

      <Card className="mb-6">
        <p className="text-sm leading-relaxed">
          สั่งอาหารจากร้านในตำบล ส่งของ หรือเรียกรถ
          โดยคนในตำบลเดียวกัน — ค่าส่งถูกกว่า ถึงเร็วกว่า
          และเงินหมุนอยู่ในชุมชน
        </p>
        <div className="flex gap-2 mt-4">
          <Link
            href="/signup"
            className="flex-1 text-center bg-indigo text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            สมัครใช้งาน
          </Link>
          <Link
            href="/login"
            className="flex-1 text-center border border-border rounded-xl py-2.5 text-sm font-semibold"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </Card>

      <h2 className="font-head font-semibold text-sm mb-2">
        ร้านค้าที่เปิดอยู่
        {merchants.length > 0 && (
          <span className="text-ink-soft font-normal"> ({merchants.length})</span>
        )}
      </h2>

      {merchants.length === 0 ? (
        <EmptyState>
          ยังไม่มีร้านค้าเปิดให้บริการในตำบลนี้
          <br />
          เป็นร้านแรกได้เลย — สมัครแล้วเปิดร้านได้ทันที
        </EmptyState>
      ) : (
        <Card className="!p-0 divide-y divide-border">
          {merchants.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-tint text-indigo flex items-center justify-center text-lg flex-none">
                🍽️
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-head font-semibold text-sm truncate">{m.name}</div>
                {m.category && <div className="text-ink-soft text-xs">{m.category}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-ink-soft text-xs text-center mt-6 leading-relaxed">
        ต้องเข้าสู่ระบบเพื่อสั่งซื้อ
        <br />
        รายชื่อนี้แสดงเฉพาะร้านที่เปิดรับออร์เดอร์อยู่ในขณะนี้
      </p>
    </main>
  );
}
