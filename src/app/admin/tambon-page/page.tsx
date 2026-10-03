"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, PageHeading, Textarea } from "@/components/ui";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";
import { dateStr } from "@/lib/domain";
import { useSession } from "@/lib/session-context";
import type { Json, Tables } from "@/lib/types";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 3 * 1024 * 1024;

type Post = Tables<"tambon_posts">;
type AiItem = Tables<"tambon_ai_items">;

/** รายการใน jsonb (สินค้า/ประเพณี/แหล่งท่องเที่ยว) ↔ ข้อความบรรทัดละรายการ "ชื่อ | รายละเอียด" */
function itemsToText(value: Json | null | undefined): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((raw) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "";
      const it = raw as Record<string, Json | undefined>;
      const name = typeof it.name === "string" ? it.name : "";
      const desc = typeof it.description === "string" && it.description ? ` | ${it.description}` : "";
      return name ? name + desc : "";
    })
    .filter(Boolean)
    .join("\n");
}

function textToItems(text: string): Json {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => {
      const [name, ...rest] = l.split("|");
      const description = rest.join("|").trim();
      return description ? { name: name.trim(), description } : { name: name.trim() };
    });
}

/**
 * หน้าตำบลบนเว็บ (/t/<slug>) — ตัวแทนตำบลแก้เองได้ (D50 อนุมัติ 3 ต.ค. 69)
 * รูปปก ข้อความแนะนำ ประกาศ ช่องทางติดต่อ ข้อมูลตำบล และข่าว/ประกาศสั้น
 * สิทธิ์คุมที่ฐานข้อมูล: แก้ได้เฉพาะตำบลที่ดูแล (can_admin_tambon)
 */
export default function TambonPageEditor() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();

  return (
    <div>
      <PageHeading title="หน้าตำบล" subtitle="หน้าเว็บสาธารณะของตำบล ที่ลูกค้าและร้านค้าเปิดดูได้โดยไม่ต้องล็อกอิน" />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />
      {!selected ? (
        <p className="text-ink-soft text-sm">เลือกตำบลด้านบนก่อน</p>
      ) : (
        <Editor key={selected.id} tambon={selected} />
      )}
    </div>
  );
}

function Editor({ tambon }: { tambon: Tables<"tambons"> }) {
  const [t, setT] = useState(tambon);
  const [profile, setProfile] = useState<Partial<Tables<"tambon_profiles">>>({});
  const [products, setProducts] = useState("");
  const [traditions, setTraditions] = useState("");
  const [attractions, setAttractions] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const say = (k: string, v: string) => setMsg((m) => ({ ...m, [k]: v }));

  const loadPosts = useCallback(async () => {
    const { data } = await createClient()
      .from("tambon_posts")
      .select("*")
      .eq("tambon_id", tambon.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setPosts(data ?? []);
  }, [tambon.id]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("tambon_profiles")
      .select("*")
      .eq("tambon_id", tambon.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setProfile(data);
        setProducts(itemsToText(data.products));
        setTraditions(itemsToText(data.traditions));
        setAttractions(itemsToText(data.attractions));
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    loadPosts();
  }, [tambon.id, loadPosts]);

  async function saveText() {
    setBusy(true);
    const { data, error } = await createClient()
      .from("tambons")
      .update({
        intro: t.intro?.trim() || null,
        announcement: t.announcement?.trim() || null,
        contact_phone: t.contact_phone?.trim() || null,
        contact_line: t.contact_line?.trim() || null,
      })
      .eq("id", t.id)
      .select("id");
    setBusy(false);
    say("text", error || !data?.length ? `บันทึกไม่สำเร็จ${error ? `: ${error.message}` : " (ไม่ใช่ตำบลที่ดูแล)"}` : "บันทึกแล้ว");
  }

  async function uploadCover(file: File) {
    const ext = EXT[file.type];
    if (!ext) return say("cover", "รองรับเฉพาะ JPG, PNG หรือ WEBP");
    if (file.size > MAX_BYTES) return say("cover", "รูปใหญ่เกิน 3 MB");
    setBusy(true);
    const supabase = createClient();
    const path = `${t.id}/cover-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("tambon-media").upload(path, file, { contentType: file.type });
    if (upErr) {
      setBusy(false);
      return say("cover", `อัปโหลดไม่สำเร็จ: ${upErr.message}`);
    }
    const url = supabase.storage.from("tambon-media").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("tambons").update({ cover_url: url }).eq("id", t.id);
    setBusy(false);
    if (error) return say("cover", `บันทึกไม่สำเร็จ: ${error.message}`);
    setT({ ...t, cover_url: url });
    say("cover", "เปลี่ยนรูปปกแล้ว");
  }

  async function saveProfile() {
    setBusy(true);
    const { error } = await createClient()
      .from("tambon_profiles")
      .upsert(
        {
          tambon_id: t.id,
          main_economy: profile.main_economy?.trim() || null,
          culture: profile.culture?.trim() || null,
          products: textToItems(products),
          traditions: textToItems(traditions),
          attractions: textToItems(attractions),
        },
        { onConflict: "tambon_id" }
      );
    setBusy(false);
    say("profile", error ? `บันทึกไม่สำเร็จ: ${error.message}` : "บันทึกข้อมูลตำบลแล้ว");
  }

  async function addPost() {
    setBusy(true);
    const { error } = await createClient()
      .from("tambon_posts")
      .insert({ tambon_id: t.id, title: newTitle.trim(), body: newBody.trim() });
    setBusy(false);
    if (error) return say("post", `โพสต์ไม่สำเร็จ: ${error.message}`);
    setNewTitle("");
    setNewBody("");
    say("post", "โพสต์แล้ว");
    loadPosts();
  }

  async function updatePost(p: Post, patch: { pinned?: boolean; is_published?: boolean }) {
    const { error } = await createClient().from("tambon_posts").update(patch).eq("id", p.id);
    if (error) say("post", `แก้ไม่สำเร็จ: ${error.message}`);
    loadPosts();
  }

  async function deletePost(p: Post) {
    const { error } = await createClient().from("tambon_posts").delete().eq("id", p.id);
    if (error) say("post", `ลบไม่สำเร็จ: ${error.message}`);
    loadPosts();
  }

  return (
    <div className="flex flex-col gap-4">
      {t.slug && (
        <Link href={`/t/${t.slug}`} className="text-indigo font-semibold text-sm">
          เปิดดูหน้า{tambonName(t)} ›
        </Link>
      )}

      <Card>
        <div className="font-head font-semibold text-sm mb-2">รูปปก</div>
        {t.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Supabase Storage ของเรา
          <img src={t.cover_url} alt={`รูปปก${tambonName(t)}`} className="w-full max-h-48 object-cover rounded-xl mb-2" />
        ) : (
          <p className="text-ink-soft text-xs mb-2">ยังไม่มีรูปปก — แนะนำรูปวัด ตลาด หรือทุ่งนาของตำบล แนวนอน</p>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) uploadCover(f);
          }}
          className="block w-full text-sm"
        />
        {msg.cover && <p className="text-sm text-ink mt-2">{msg.cover}</p>}
      </Card>

      <Card>
        <div className="font-head font-semibold text-sm mb-2">ข้อความบนหน้าตำบล</div>
        <Field label="แนะนำตำบล">
          <Textarea rows={3} value={t.intro ?? ""} onChange={(e) => setT({ ...t, intro: e.target.value })} />
        </Field>
        <Field label="ประกาศเด่น (แสดงบนสุด เว้นว่างได้)">
          <Textarea rows={2} value={t.announcement ?? ""} onChange={(e) => setT({ ...t, announcement: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="เบอร์ติดต่อตัวแทน">
            <Input value={t.contact_phone ?? ""} onChange={(e) => setT({ ...t, contact_phone: e.target.value })} />
          </Field>
          <Field label="LINE ID ตัวแทน">
            <Input value={t.contact_line ?? ""} onChange={(e) => setT({ ...t, contact_line: e.target.value })} />
          </Field>
        </div>
        <Button onClick={saveText} disabled={busy}>
          บันทึกข้อความ
        </Button>
        {msg.text && <p className="text-sm text-ink mt-2">{msg.text}</p>}
      </Card>

      <Card>
        <div className="font-head font-semibold text-sm mb-1">รู้จักตำบลนี้</div>
        <p className="text-ink-soft text-xs mb-3">รายการ: บรรทัดละ 1 รายการ ใส่รายละเอียดหลังเครื่องหมาย | ได้ เช่น “ผ้าไหมมัดหมี่ | ทอมือ กลุ่มแม่บ้าน”</p>
        <Field label="เศรษฐกิจหลัก">
          <Textarea rows={2} value={profile.main_economy ?? ""} onChange={(e) => setProfile({ ...profile, main_economy: e.target.value })} />
        </Field>
        <Field label="วัฒนธรรมและวิถีชุมชน">
          <Textarea rows={2} value={profile.culture ?? ""} onChange={(e) => setProfile({ ...profile, culture: e.target.value })} />
        </Field>
        <Field label="สินค้าเด่นของชุมชน">
          <Textarea rows={3} value={products} onChange={(e) => setProducts(e.target.value)} />
        </Field>
        <Field label="ประเพณีประจำถิ่น">
          <Textarea rows={3} value={traditions} onChange={(e) => setTraditions(e.target.value)} />
        </Field>
        <Field label="แหล่งท่องเที่ยว">
          <Textarea rows={3} value={attractions} onChange={(e) => setAttractions(e.target.value)} />
        </Field>
        <Button onClick={saveProfile} disabled={busy}>
          บันทึกข้อมูลตำบล
        </Button>
        {msg.profile && <p className="text-sm text-ink mt-2">{msg.profile}</p>}
      </Card>

      <Card>
        <div className="font-head font-semibold text-sm mb-2">ข่าวและประกาศของตำบล</div>
        <Field label="หัวข้อ">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="เช่น ตลาดนัดเย็นวันศุกร์ หน้าวัด" />
        </Field>
        <Field label="รายละเอียด">
          <Textarea rows={3} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
        </Field>
        <Button onClick={addPost} disabled={busy || newTitle.trim().length < 3}>
          โพสต์
        </Button>
        {msg.post && <p className="text-sm text-ink mt-2">{msg.post}</p>}

        <div className="mt-4 flex flex-col gap-2">
          {posts.length === 0 ? (
            <EmptyState>ยังไม่มีโพสต์</EmptyState>
          ) : (
            posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-3">
                <div className="font-head font-semibold text-sm">
                  {p.pinned ? "📌 " : ""}
                  {p.title}
                  {!p.is_published && <span className="text-ink-soft text-xs"> · ซ่อนอยู่</span>}
                </div>
                <p className="text-ink-soft text-xs mb-2">{dateStr(p.created_at)}</p>
                {p.body && <p className="text-sm text-ink mb-2 whitespace-pre-line">{p.body}</p>}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={() => updatePost(p, { pinned: !p.pinned })}>
                    {p.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                  </Button>
                  <Button variant="ghost" onClick={() => updatePost(p, { is_published: !p.is_published })}>
                    {p.is_published ? "ซ่อน" : "แสดง"}
                  </Button>
                  <Button variant="secondary" onClick={() => deletePost(p)}>
                    ลบ
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <AiItemsCard tambon={t} />
    </div>
  );
}

const AI_KIND: Record<string, string> = {
  news: "ข่าว",
  event: "กิจกรรม",
  place: "สถานที่",
  product: "สินค้า",
  tradition: "ประเพณี",
  fact: "ข้อมูลทั่วไป",
};

/**
 * ข้อมูลที่ AI รวบรวมจากเว็บทุกวัน (D51) — ตัวแทนตรวจแล้วซ่อนรายการที่ไม่ถูกต้องได้
 * ส่วนกลางเป็นคนเปิด/ปิดให้ AI ทำข้อมูลต่อตำบล (tambons.ai_content_enabled)
 */
function AiItemsCard({ tambon }: { tambon: Tables<"tambons"> }) {
  const { profile } = useSession();
  const [items, setItems] = useState<AiItem[]>([]);
  const [lastRun, setLastRun] = useState<Tables<"tambon_ai_runs"> | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: it }, { data: runs }] = await Promise.all([
      supabase
        .from("tambon_ai_items")
        .select("*")
        .eq("tambon_id", tambon.id)
        .order("hidden")
        .order("refreshed_at", { ascending: false })
        .limit(80),
      supabase.from("tambon_ai_runs").select("*").eq("tambon_id", tambon.id).order("ran_at", { ascending: false }).limit(1),
    ]);
    setItems(it ?? []);
    setLastRun(runs?.[0] ?? null);
    setNow(Date.now());
  }, [tambon.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function toggle(it: AiItem) {
    const hidden = !it.hidden;
    const { error } = await createClient()
      .from("tambon_ai_items")
      .update({ hidden, hidden_by: hidden ? profile.id : null })
      .eq("id", it.id);
    setErr(error ? `แก้ไม่สำเร็จ: ${error.message}` : "");
    load();
  }

  if (!tambon.ai_content_enabled && items.length === 0) return null;

  return (
    <Card>
      <div className="font-head font-semibold text-sm mb-1">ข้อมูลที่ AI รวบรวมจากเว็บ</div>
      <p className="text-ink-soft text-xs mb-3">
        AI ค้นข้อมูลสาธารณะของตำบลวันละครั้ง ทุกรายการมีลิงก์แหล่งที่มา ตรวจแล้วกด “ซ่อน” รายการที่ไม่ถูกต้องได้
        {lastRun && ` · รันล่าสุด ${dateStr(lastRun.ran_at)}${lastRun.status === "error" ? " (มีปัญหา)" : ""}`}
      </p>
      {err && <p className="text-sm text-clay mb-2">{err}</p>}
      {items.length === 0 ? (
        <EmptyState>ยังไม่มีรายการ — AI จะเริ่มรวบรวมในรอบถัดไป</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const expired = it.expires_at !== null && new Date(it.expires_at).getTime() < now;
            return (
              <div key={it.id} className={`rounded-xl border border-border p-3 ${it.hidden || expired ? "opacity-60" : ""}`}>
                <div className="font-head font-semibold text-sm">
                  <span className="text-ink-soft text-xs font-normal">{AI_KIND[it.kind] ?? it.kind} · </span>
                  {it.title}
                  {it.hidden && <span className="text-ink-soft text-xs"> · ซ่อนอยู่</span>}
                  {expired && <span className="text-ink-soft text-xs"> · หมดอายุ</span>}
                </div>
                {it.summary && <p className="text-sm text-ink mt-1">{it.summary}</p>}
                <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="text-indigo text-xs underline break-all">
                  {it.source_name || it.source_url}
                </a>
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => toggle(it)}>
                    {it.hidden ? "แสดง" : "ซ่อน"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
