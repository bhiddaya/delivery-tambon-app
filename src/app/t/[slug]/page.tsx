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
 *   - ใบขอเปิดตำบล (tambon_applications) มีเบอร์ผู้สมัคร จึงไม่ GRANT ให้ anon เลย
 * ดู supabase/migrations/20260903_public_read_tambon_directory.sql
 *   และ 20260904_tambon_onboarding_and_profiles.sql
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
  intro: string | null;
  announcement: string | null;
  contact_line: string | null;
  contact_phone: string | null;
  delivery_fee_base: number | null;
  delivery_fee_per_km: number | null;
  is_active: boolean;
};

type MerchantPublic = {
  id: string;
  name: string;
  category: string | null;
};

/** รายการใน attractions / traditions / products — เก็บเป็น jsonb จึงต้องตรวจรูปร่างเอง */
type NamedItem = {
  name: string;
  month?: string | null;
  description?: string | null;
};

type TambonProfile = {
  local_gov_name: string | null;
  local_gov_website: string | null;
  population: number | null;
  households: number | null;
  villages: number | null;
  area_sqkm: number | null;
  main_economy: string | null;
  culture: string | null;
  attractions: unknown;
  traditions: unknown;
  products: unknown;
  budget_year: number | null;
  budget_total: number | null;
  sources: unknown;
};

const TAMBON_COLUMNS =
  "id, name, district, province, intro, announcement, contact_line, contact_phone, delivery_fee_base, delivery_fee_per_km, is_active";

const PROFILE_COLUMNS =
  "local_gov_name, local_gov_website, population, households, villages, area_sqkm, main_economy, culture, attractions, traditions, products, budget_year, budget_total, sources";

async function getTambon(slug: string): Promise<TambonPublic | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tambons")
    .select(TAMBON_COLUMNS)
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
 * ตาราง tambons เก็บชื่อแบบเต็ม ("ตำบลบุ่งไหม", "อำเภอวารินชำราบ") แต่บางแถว
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

/**
 * jsonb รับอะไรก็ได้ ผู้กรอกอาจใส่รูปแบบผิด — คัดเฉพาะรายการที่มีชื่อจริง
 * ไม่ throw เพราะข้อมูลประกอบไม่ควรทำให้ทั้งหน้าล่ม
 */
function asNamedItems(value: unknown): NamedItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== "string" || item.name.trim() === "") return [];
    return [
      {
        name: item.name.trim(),
        month: typeof item.month === "string" ? item.month : null,
        description: typeof item.description === "string" ? item.description : null,
      },
    ];
  });
}

function hasSources(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

const num = (n: number) => n.toLocaleString("th-TH");

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
  const label = tambonLabel(tambon);
  const title = `${label}${place ? ` ${place}` : ""}`;

  return {
    title,
    description: tambon.is_active
      ? `สั่งอาหาร ส่งของ เรียกรถ ภายใน${label} — บวรไทย`
      : `${label} กำลังเตรียมเปิดให้บริการ — บวรไทย`,
    openGraph: { title, type: "website" },
  };
}

/** แถบสถิติ — แสดงเฉพาะช่องที่มีข้อมูลจริง ไม่โชว์ขีดกลางให้ดูเหมือนระบบพัง */
function StatGrid({ profile }: { profile: TambonProfile }) {
  const stats: { label: string; value: string }[] = [];
  if (profile.population !== null) stats.push({ label: "ประชากร", value: `${num(profile.population)} คน` });
  if (profile.households !== null) stats.push({ label: "ครัวเรือน", value: num(profile.households) });
  if (profile.villages !== null) stats.push({ label: "หมู่บ้าน", value: num(profile.villages) });
  if (profile.area_sqkm !== null) stats.push({ label: "พื้นที่", value: `${num(profile.area_sqkm)} ตร.กม.` });

  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl bg-indigo-tint px-3 py-2.5">
          <div className="text-ink-soft text-xs">{s.label}</div>
          <div className="font-head font-semibold text-sm mt-0.5">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: NamedItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="font-head font-semibold text-sm mb-1.5">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="text-sm leading-relaxed">
            <span className="font-medium">{it.name}</span>
            {it.month && <span className="text-ink-soft"> · {it.month}</span>}
            {it.description && <div className="text-ink-soft text-xs mt-0.5">{it.description}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TambonKnowledge({ profile }: { profile: TambonProfile }) {
  const attractions = asNamedItems(profile.attractions);
  const traditions = asNamedItems(profile.traditions);
  const products = asNamedItems(profile.products);

  const isEmpty =
    profile.population === null &&
    profile.households === null &&
    profile.villages === null &&
    profile.area_sqkm === null &&
    !profile.main_economy &&
    !profile.culture &&
    attractions.length === 0 &&
    traditions.length === 0 &&
    products.length === 0 &&
    profile.budget_total === null &&
    !profile.local_gov_name;

  // ยังไม่มีใครกรอก — ไม่ต้องโชว์กล่องเปล่าให้ดูเหมือนระบบยังไม่เสร็จ
  if (isEmpty) return null;

  return (
    <section className="mt-8">
      <h2 className="font-head font-semibold text-sm mb-2">รู้จักตำบลนี้</h2>
      <Card>
        <StatGrid profile={profile} />

        {profile.main_economy && (
          <div className="mb-3">
            <h3 className="font-head font-semibold text-sm mb-1">เศรษฐกิจหลัก</h3>
            <p className="text-sm leading-relaxed">{profile.main_economy}</p>
          </div>
        )}

        {profile.culture && (
          <div className="mb-3">
            <h3 className="font-head font-semibold text-sm mb-1">วัฒนธรรมและวิถีชุมชน</h3>
            <p className="text-sm leading-relaxed">{profile.culture}</p>
          </div>
        )}

        <ItemList title="ประเพณีประจำถิ่น" items={traditions} />
        <ItemList title="แหล่งท่องเที่ยว" items={attractions} />
        <ItemList title="สินค้าชุมชน" items={products} />

        {profile.budget_total !== null && (
          <div className="mt-4">
            <h3 className="font-head font-semibold text-sm mb-1">
              งบประมาณ{profile.budget_year ? ` ปี ${profile.budget_year}` : ""}
            </h3>
            <p className="text-sm">{num(profile.budget_total)} บาท</p>
          </div>
        )}

        {profile.local_gov_name && (
          <p className="text-ink-soft text-xs mt-4 pt-3 border-t border-border">
            หน่วยงานท้องถิ่น:{" "}
            {profile.local_gov_website ? (
              <a
                href={profile.local_gov_website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo underline"
              >
                {profile.local_gov_name}
              </a>
            ) : (
              profile.local_gov_name
            )}
          </p>
        )}

        {/* ตัวเลขประชากร/งบประมาณจะถูกอ้างต่อ จึงต้องบอกให้ชัดว่าใครเป็นคนกรอก */}
        <p className="text-ink-soft text-xs mt-2">
          {hasSources(profile.sources)
            ? "ข้อมูลนี้กรอกโดยตัวแทนตำบล พร้อมระบุแหล่งที่มาไว้ในระบบ"
            : "ข้อมูลนี้กรอกโดยตัวแทนตำบล ยังไม่ได้ระบุแหล่งที่มา โปรดตรวจสอบกับหน่วยงานท้องถิ่นก่อนนำไปอ้างอิง"}
        </p>
      </Card>
    </section>
  );
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

  const { data: profileRow, error: profileError } = await supabase
    .from("tambon_profiles")
    .select(PROFILE_COLUMNS)
    .eq("tambon_id", tambon.id)
    .maybeSingle();

  if (profileError) {
    console.error("[/t/%s] tambon profile failed:", slug, profileError.message);
  }
  const profile = (profileRow as TambonProfile | null) ?? null;

  // ตำบลที่อนุมัติแล้วแต่ยังไม่เปิดบริการ ไม่ควรโชว์รายชื่อร้าน
  // และไม่ควรตอบ 404 ด้วย — หน้านี้คือเครื่องมือให้ตัวแทนตำบลใช้ชวนร้านค้าเข้าร่วม
  const merchants: MerchantPublic[] = [];
  if (tambon.is_active) {
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
    merchants.push(...((merchantRows ?? []) as MerchantPublic[]));
  }

  const place = fullPlace(tambon);
  const label = tambonLabel(tambon);

  const feeNote =
    tambon.delivery_fee_base !== null
      ? `ค่าส่งเริ่มต้น ${num(tambon.delivery_fee_base)} บาท` +
        (tambon.delivery_fee_per_km !== null
          ? ` + ${num(tambon.delivery_fee_per_km)} บาท/กม.`
          : "")
      : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <p className="text-ink-soft text-xs">บวรไทย · ระบบส่งของระดับตำบล</p>
        <h1 className="text-2xl font-head font-bold mt-1">{label}</h1>
        {place && <p className="text-ink-soft text-sm mt-0.5">{place}</p>}
      </header>

      {tambon.announcement && (
        <div className="mb-4 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3">
          <p className="text-sm leading-relaxed">{tambon.announcement}</p>
        </div>
      )}

      {!tambon.is_active && (
        <div className="mb-4 rounded-xl border border-border bg-indigo-tint px-4 py-3">
          <p className="font-head font-semibold text-sm">กำลังเตรียมเปิดให้บริการ</p>
          <p className="text-sm leading-relaxed mt-1">
            {label}อยู่ระหว่างรวบรวมร้านค้าและไรเดอร์
            สมัครไว้ตั้งแต่ตอนนี้ได้เลย จะได้เริ่มพร้อมกันวันแรก
          </p>
        </div>
      )}

      <Card className="mb-6">
        <p className="text-sm leading-relaxed">
          {tambon.intro ??
            "สั่งอาหารจากร้านในตำบล ส่งของ หรือเรียกรถ โดยคนในตำบลเดียวกัน — ค่าส่งถูกกว่า ถึงเร็วกว่า และเงินหมุนอยู่ในชุมชน"}
        </p>
        {feeNote && <p className="text-ink-soft text-xs mt-2">{feeNote}</p>}
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
        {(tambon.contact_line || tambon.contact_phone) && (
          <p className="text-ink-soft text-xs mt-3">
            ติดต่อตัวแทนตำบล:{" "}
            {[tambon.contact_phone, tambon.contact_line].filter(Boolean).join(" · ")}
          </p>
        )}
      </Card>

      {tambon.is_active && (
        <>
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
        </>
      )}

      {profile && <TambonKnowledge profile={profile} />}

      <p className="text-ink-soft text-xs text-center mt-8 leading-relaxed">
        ต้องเข้าสู่ระบบเพื่อสั่งซื้อ
        {tambon.is_active && (
          <>
            <br />
            รายชื่อนี้แสดงเฉพาะร้านที่เปิดรับออร์เดอร์อยู่ในขณะนี้
          </>
        )}
      </p>
    </main>
  );
}
