import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import SetupRequired from "@/components/SetupRequired";
import { Card, EmptyState } from "@/components/ui";
import { lineOaTextLink, tambonLineLink } from "@/lib/tambon-links";

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
  cover_url: string | null;
  delivery_fee_base: number | null;
  delivery_fee_per_km: number | null;
  is_active: boolean;
};

type PostPublic = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

type BoardPublic = {
  id: number;
  kind: "job" | "announcement";
  org_name: string;
  org_type: string;
  title: string;
  body: string;
  link_url: string | null;
  job_positions: number | null;
  job_wage: string | null;
  job_location: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type VoiceStats = {
  total: number;
  in_progress: number;
  resolved: number;
  categories: { category: string; count: number }[];
  resolved_titles: { title: string; category: string | null; resolved_at: string }[];
};

type AiItemPublic = {
  id: number;
  kind: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string | null;
  event_date: string | null;
  first_seen_at: string;
  refreshed_at: string;
  is_new: boolean;
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
  "id, name, district, province, intro, announcement, contact_line, contact_phone, cover_url, delivery_fee_base, delivery_fee_per_km, is_active";

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

const ORG_TYPE_LABEL: Record<string, string> = {
  government: "หน่วยงานรัฐ",
  private: "เอกชน",
  community: "ชุมชน",
  other: "",
};

/** ประกาศรับสมัครงาน + ประกาศจากหน่วยงาน — ใครก็ลงได้ฟรี ตัวแทนอนุมัติก่อนขึ้น · สมัครงานผ่าน LINE แล้วระบบส่งต่อนายจ้าง */
function BoardSection({ slug, items }: { slug: string; items: BoardPublic[] }) {
  const jobs = items.filter((i) => i.kind === "job");
  const news = items.filter((i) => i.kind === "announcement");
  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-head font-semibold text-sm">ประกาศรับสมัครงานในตำบล</h2>
        <Link href={`/t/${encodeURIComponent(slug)}/post`} className="text-indigo text-xs font-semibold">
          ลงประกาศฟรี ›
        </Link>
      </div>
      {jobs.length === 0 ? (
        <Card className="mb-4">
          <p className="text-sm">ยังไม่มีประกาศงาน — ร้านค้า โรงงาน หรือหน่วยงานในพื้นที่ลงประกาศรับสมัครได้ฟรี</p>
          <p className="text-xs mt-2">
            กำลังหางาน?{" "}
            <a href={lineOaTextLink("สมัครงาน")} className="text-indigo font-semibold">
              ฝากประวัติผ่าน LINE ›
            </a>
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {jobs.map((j) => (
            <Card key={j.id}>
              <div className="font-head font-semibold text-sm">{j.title}</div>
              <div className="text-ink-soft text-xs">
                {j.org_name}
                {ORG_TYPE_LABEL[j.org_type] ? ` · ${ORG_TYPE_LABEL[j.org_type]}` : ""}
              </div>
              <div className="text-xs mt-1">
                {[j.job_positions && `${j.job_positions} อัตรา`, j.job_wage, j.job_location].filter(Boolean).join(" · ")}
              </div>
              {j.body && <p className="text-sm leading-relaxed mt-1 whitespace-pre-line">{j.body}</p>}
              <a
                href={lineOaTextLink(`สมัครงาน J${j.id}`)}
                className="inline-block bg-[#06C755] text-white rounded-xl px-4 py-2 text-sm font-semibold mt-2"
              >
                สมัครงานนี้ผ่าน LINE
              </a>
            </Card>
          ))}
        </div>
      )}

      {news.length > 0 && (
        <>
          <h2 className="font-head font-semibold text-sm mb-2">ประกาศจากหน่วยงานในพื้นที่</h2>
          <div className="flex flex-col gap-2">
            {news.map((n) => (
              <Card key={n.id}>
                <div className="text-ink-soft text-xs">
                  {n.org_name}
                  {ORG_TYPE_LABEL[n.org_type] ? ` · ${ORG_TYPE_LABEL[n.org_type]}` : ""}
                  {n.reviewed_at ? ` · ${thaiDate(n.reviewed_at)}` : ""}
                </div>
                <div className="font-head font-semibold text-sm">{n.title}</div>
                {n.body && <p className="text-sm leading-relaxed mt-1 whitespace-pre-line">{n.body}</p>}
                {n.link_url && (
                  <a href={n.link_url} target="_blank" rel="noopener noreferrer nofollow" className="text-indigo text-xs underline break-all">
                    อ่านเพิ่มเติม
                  </a>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** ปากเสียงตำบล — ตัวเลขเรื่องที่ประชาชนแจ้งผ่าน LINE และเรื่องที่แก้แล้ว ไม่มีข้อมูลระบุตัวผู้แจ้ง */
function VoiceSection({ voice }: { voice: VoiceStats | null }) {
  return (
    <section className="mb-6">
      <h2 className="font-head font-semibold text-sm mb-2">เสียงจากตำบล</h2>
      <Card>
        {voice && voice.total > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-indigo-tint px-2 py-2">
                <div className="font-head font-bold text-lg tabular-nums">{voice.total}</div>
                <div className="text-ink-soft text-[11px]">เรื่องที่แจ้ง</div>
              </div>
              <div className="rounded-xl bg-indigo-tint px-2 py-2">
                <div className="font-head font-bold text-lg tabular-nums">{voice.in_progress}</div>
                <div className="text-ink-soft text-[11px]">กำลังดำเนินการ</div>
              </div>
              <div className="rounded-xl bg-indigo-tint px-2 py-2">
                <div className="font-head font-bold text-lg tabular-nums">{voice.resolved}</div>
                <div className="text-ink-soft text-[11px]">แก้แล้ว</div>
              </div>
            </div>
            {voice.categories.length > 0 && (
              <p className="text-xs text-ink-soft mt-2">
                {voice.categories.map((c) => `${c.category} ${c.count}`).join(" · ")}
              </p>
            )}
            {voice.resolved_titles.length > 0 && (
              <ul className="mt-3 space-y-1">
                {voice.resolved_titles.map((r, i) => (
                  <li key={i} className="text-sm">
                    ✓ {r.title} <span className="text-ink-soft text-xs">· {thaiDate(r.resolved_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm">ยังไม่มีเรื่องที่แจ้งเข้ามา</p>
        )}
        <p className="text-xs mt-3">
          มีปัญหาในพื้นที่? ถนน ไฟฟ้า ขยะ ความปลอดภัย{" "}
          <a href={lineOaTextLink("แจ้งเรื่อง")} className="text-indigo font-semibold">
            แจ้งผ่าน LINE ›
          </a>{" "}
          <span className="text-ink-soft">ไม่เปิดเผยชื่อผู้แจ้ง</span>
        </p>
      </Card>
    </section>
  );
}

type AiCta = { text: string; label: string; line: string };

/**
 * กลุ่มข้อมูลที่ AI รวบรวม (หัวข้อที่อาจารย์กำหนด 3 ต.ค. 69) · maps = ลิงก์ค้นใน Google Maps
 * cta = ชวนต่อยอดกับบริการบวรไทย (ส่งข้อความเข้า LINE OA เหมือนปุ่มสมัครด้านบน)
 */
const AI_GROUPS: { kinds: string[]; title: string; maps?: boolean; cta?: AiCta }[] = [
  { kinds: ["news", "event"], title: "ข่าวและกิจกรรมในพื้นที่" },
  { kinds: ["education"], title: "โรงเรียนและสถานศึกษา", maps: true },
  {
    kinds: ["industry"],
    title: "โรงงานและผู้ผลิตสำคัญ",
    maps: true,
    cta: { text: "หางานในพื้นที่นี้?", label: "ฝากประวัติหางาน", line: "สมัครงาน" },
  },
  { kinds: ["place"], title: "แหล่งท่องเที่ยวและสถานที่สำคัญ", maps: true },
  {
    kinds: ["food"],
    title: "ร้านอาหารและร้านค้าเด่น",
    maps: true,
    cta: { text: "เป็นเจ้าของร้านในตำบลนี้?", label: "เปิดร้านกับบวรไทย", line: "สมัครร้านค้า" },
  },
  { kinds: ["health"], title: "ร้านขายยา คลินิก และสุขภาพ", maps: true },
  { kinds: ["shopping"], title: "ห้างสรรพสินค้าและตลาด", maps: true },
  { kinds: ["product"], title: "สินค้าชุมชน" },
  { kinds: ["tradition"], title: "ประเพณีและวัฒนธรรม" },
  { kinds: ["fact"], title: "ข้อมูลทั่วไป" },
];

/**
 * ข้อมูลที่ AI รวบรวมจากเว็บ (D51) · RLS ให้ anon เห็นเฉพาะที่ไม่ถูกซ่อนและยังไม่หมดอายุ
 * is_new = AI พบครั้งแรกภายใน 24 ชั่วโมง (ป้าย "ใหม่" และสรุปรายวัน) คิดตอนดึงข้อมูล ไม่ใช่ตอน render
 */
async function getAiItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tambonId: string,
  slug: string
): Promise<AiItemPublic[]> {
  const { data, error } = await supabase
    .from("tambon_ai_items")
    .select("id, kind, title, summary, source_url, source_name, event_date, first_seen_at, refreshed_at")
    .eq("tambon_id", tambonId)
    .eq("hidden", false)
    .order("refreshed_at", { ascending: false })
    .limit(60);
  if (error) console.error("[/t/%s] ai items failed:", slug, error.message);
  const now = Date.now();
  return (data ?? []).map((it) => ({ ...it, is_new: now - Date.parse(it.first_seen_at) < 864e5 }));
}

/** ค้นใน Google Maps ด้วยชื่อ + พื้นที่ — ไม่ต้องใช้ API key และไม่เก็บพิกัดในฐานข้อมูล */
const mapsLink = (name: string, area: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${area}`)}`;

const thaiDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** ข้อมูลที่ AI รวบรวม —ต้องบอกชัดว่า AI ทำ พร้อมลิงก์แหล่งที่มาและวันที่ทุกรายการ */
function AiItems({ items, area }: { items: AiItemPublic[]; area: string }) {
  if (items.length === 0) return null;
  const latest = items.reduce((a, b) => (a > b.refreshed_at ? a : b.refreshed_at), "");
  const newToday = items.filter((it) => it.is_new).length;
  return (
    <section className="mt-8">
      <h2 className="font-head font-semibold text-sm mb-1">ข้อมูลจากเว็บเกี่ยวกับพื้นที่นี้</h2>
      <p className="text-ink-soft text-xs mb-2">
        รวบรวมโดย AI จากเว็บไซต์สาธารณะ · อัปเดต {thaiDate(latest)} · โปรดตรวจสอบกับแหล่งที่มาก่อนนำไปอ้างอิง
      </p>
      {newToday > 0 && (
        <p className="text-xs font-semibold text-clay mb-2">วันนี้ AI พบข้อมูลใหม่ {newToday} รายการ</p>
      )}
      <Card>
        {AI_GROUPS.map((g) => {
          const list = items.filter((it) => g.kinds.includes(it.kind));
          if (list.length === 0) return null;
          return (
            <div key={g.title} className="mb-4 last:mb-0">
              <h3 className="font-head font-semibold text-sm mb-1.5">{g.title}</h3>
              <ul className="space-y-2">
                {list.map((it) => (
                  <li key={it.id} className="text-sm leading-relaxed">
                    {it.is_new && (
                      <span className="text-[10px] font-semibold text-white bg-clay rounded px-1 mr-1">ใหม่</span>
                    )}
                    <span className="font-medium">{it.title}</span>
                    {it.event_date && <span className="text-ink-soft"> · {thaiDate(it.event_date)}</span>}
                    {it.summary && <div className="text-ink-soft text-xs mt-0.5">{it.summary}</div>}
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      <a
                        href={it.source_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-indigo underline break-all"
                      >
                        ที่มา: {it.source_name || hostOf(it.source_url)}
                      </a>
                      {g.maps && (
                        <a
                          href={mapsLink(it.title, area)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo underline"
                        >
                          ดูแผนที่
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {g.cta && (
                <p className="text-xs mt-2">
                  {g.cta.text}{" "}
                  <a href={lineOaTextLink(g.cta.line)} className="text-indigo font-semibold">
                    {g.cta.label} ›
                  </a>
                </p>
              )}
            </div>
          );
        })}
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

  // ข่าว/ประกาศของตำบล (ตัวแทนโพสต์เอง · RLS ให้ anon เห็นเฉพาะที่เผยแพร่)
  const { data: postRows, error: postError } = await supabase
    .from("tambon_posts")
    .select("id, title, body, pinned, created_at")
    .eq("tambon_id", tambon.id)
    .eq("is_published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);
  if (postError) {
    console.error("[/t/%s] posts failed:", slug, postError.message);
  }
  const posts = (postRows ?? []) as PostPublic[];

  // ประกาศงาน/ประกาศหน่วยงาน (D52) · RLS ให้ anon เห็นเฉพาะที่ตัวแทนอนุมัติแล้วและยังไม่หมดอายุ
  // ข้อมูลติดต่อผู้ลงประกาศอยู่อีกตาราง anon อ่านไม่ได้
  const { data: boardRows, error: boardError } = await supabase
    .from("tambon_board_posts")
    .select("id, kind, org_name, org_type, title, body, link_url, job_positions, job_wage, job_location, reviewed_at, created_at")
    .eq("tambon_id", tambon.id)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(30);
  if (boardError) console.error("[/t/%s] board failed:", slug, boardError.message);
  const board = (boardRows ?? []) as BoardPublic[];

  // ปากเสียงตำบล: ตัวเลขเรื่องร้องเรียน + หัวเรื่องที่แก้แล้ว (เฉพาะที่ตัวแทนเขียนหัวเรื่องสาธารณะ)
  const { data: voiceData, error: voiceError } = await supabase.rpc("tambon_complaint_stats", { p_tambon_id: tambon.id });
  if (voiceError) console.error("[/t/%s] complaint stats failed:", slug, voiceError.message);
  const voice = (voiceData ?? null) as VoiceStats | null;

  const aiItems = await getAiItems(supabase, tambon.id, slug);

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
      {tambon.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก Supabase Storage (tambon-media) ที่ตัวแทนอัปโหลด
        <img
          src={tambon.cover_url}
          alt={`รูปปก${tambonLabel(tambon)}`}
          className="w-full h-44 object-cover rounded-2xl mb-4"
        />
      )}
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
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a
              href={lineOaTextLink("สมัครร้านค้า")}
              className="text-center bg-[#06C755] text-white rounded-xl py-2.5 text-sm font-semibold"
            >
              สมัครเป็นร้านค้า
            </a>
            <a
              href={lineOaTextLink("สมัครไรเดอร์")}
              className="text-center bg-[#06C755] text-white rounded-xl py-2.5 text-sm font-semibold"
            >
              สมัครเป็นไรเดอร์
            </a>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <p className="text-sm leading-relaxed">
          {tambon.intro ??
            "สั่งอาหารจากร้านในตำบล ส่งของ หรือเรียกรถ โดยคนในตำบลเดียวกัน — ค่าส่งถูกกว่า ถึงเร็วกว่า และเงินหมุนอยู่ในชุมชน"}
        </p>
        {feeNote && <p className="text-ink-soft text-xs mt-2">{feeNote}</p>}
        {tambon.is_active && (
          <a
            href={tambonLineLink(tambon.name, slug)}
            className="block text-center bg-[#06C755] text-white rounded-xl py-2.5 text-sm font-semibold mt-4"
          >
            สั่งผ่าน LINE บวรไทย
          </a>
        )}
        {tambon.is_active && (
          <p className="text-center text-xs mt-2">
            มีร้านหรือรถในตำบลนี้?{" "}
            <a href={lineOaTextLink("สมัครร้านค้า")} className="text-indigo font-semibold">
              สมัครเป็นร้านค้า
            </a>
            {" · "}
            <a href={lineOaTextLink("สมัครไรเดอร์")} className="text-indigo font-semibold">
              สมัครเป็นไรเดอร์
            </a>
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <Link
            href={`/signup?t=${encodeURIComponent(slug)}`}
            className="flex-1 text-center bg-indigo text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            สมัครใช้งาน
          </Link>
          <Link
            href={`/login?t=${encodeURIComponent(slug)}`}
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

      {/* ร้านอยู่ใต้ปุ่มสั่งทันที กดแล้วเห็นเมนู รูป ราคา และใส่ตะกร้าได้เลย ไม่ต้องล็อกอิน */}
      {tambon.is_active && (
        <section id="shops" className="mb-6">
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
                <Link
                  key={m.id}
                  href={`/shop/${encodeURIComponent(m.id)}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-indigo-tint"
                >
                  <div className="w-11 h-11 rounded-xl bg-indigo-tint text-indigo flex items-center justify-center text-lg flex-none">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-head font-semibold text-sm truncate">{m.name}</div>
                    {m.category && <div className="text-ink-soft text-xs">{m.category}</div>}
                  </div>
                  <span className="text-indigo text-sm font-semibold flex-none">ดูเมนู ›</span>
                </Link>
              ))}
            </Card>
          )}
        </section>
      )}

      {posts.length > 0 && (
        <section className="mb-6">
          <h2 className="font-head font-semibold text-sm mb-2">ข่าวและประกาศของตำบล</h2>
          <div className="flex flex-col gap-2">
            {posts.map((p) => (
              <Card key={p.id}>
                <div className="font-head font-semibold text-sm">
                  {p.pinned ? "📌 " : ""}
                  {p.title}
                </div>
                <div className="text-ink-soft text-xs">
                  {new Date(p.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                </div>
                {p.body && <p className="text-sm leading-relaxed mt-1 whitespace-pre-line">{p.body}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      <BoardSection slug={slug} items={board} />
      <VoiceSection voice={voice} />

      {profile && <TambonKnowledge profile={profile} />}

      <AiItems items={aiItems} area={`${label} ${place}`} />

      <p className="text-ink-soft text-xs text-center mt-8 leading-relaxed">
        เลือกรายการจากหน้าร้านแล้วยืนยันออเดอร์ผ่าน LINE บวรไทย
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
