"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, PageHeading, Textarea } from "@/components/ui";
import { AdminTambonPicker, useAdminTambon } from "@/components/AdminTambonPicker";
import { dateStr } from "@/lib/domain";
import { telHref } from "@/lib/tambon-admin";
import type { Database, Tables } from "@/lib/types";

type Post = Tables<"tambon_board_posts"> & { contact: Tables<"tambon_board_contacts"> | null };
type Application = Tables<"tambon_job_applications">;
type Complaint = Database["public"]["Functions"]["admin_tambon_complaints"]["Returns"][number];
type Tab = "posts" | "applications" | "complaints";

const ORG_TYPE: Record<string, string> = { government: "หน่วยงานรัฐ", private: "เอกชน/ร้านค้า", community: "ชุมชน", other: "อื่น ๆ" };
const POST_STATUS: Record<string, string> = { pending: "รออนุมัติ", approved: "ขึ้นหน้าแล้ว", rejected: "ไม่อนุมัติ", closed: "ปิดแล้ว" };
const APP_STATUS: Record<string, string> = { new: "ใหม่", forwarded: "ส่งต่อแล้ว", contacted: "ติดต่อแล้ว", closed: "ปิด" };
const COMPLAINT_STATUS: Record<string, string> = {
  received: "รับเรื่อง",
  reviewing: "กำลังตรวจสอบ",
  forwarded: "ส่งต่อหน่วยงาน",
  answered: "แก้ไข/ตอบแล้ว",
  closed: "ปิดเรื่อง",
  rejected: "ไม่รับเรื่อง",
};
const RESOLVED = ["answered", "closed"];

/**
 * ประกาศและเสียงจากตำบล (D52 อนุมัติ 4 ต.ค. 69)
 * - ประกาศงาน/ประกาศหน่วยงานที่ใครก็ส่งมาจากหน้าตำบล → ตัวแทนอนุมัติก่อนขึ้นหน้า
 * - ใบสมัครงานที่มาทาง LINE (ระบบส่งต่อนายจ้างที่ผูก LINE แล้ว)
 * - เรื่องร้องเรียนของตำบล: อัปเดตสถานะ และอนุมัติหัวเรื่องที่แก้แล้วให้ขึ้นหน้าตำบล
 */
export default function AdminBoardPage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const [tab, setTab] = useState<Tab>("posts");

  return (
    <div>
      <PageHeading title="ประกาศและเสียงจากตำบล" subtitle="อนุมัติประกาศ ดูใบสมัครงาน และติดตามเรื่องร้องเรียน" />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />
      <div className="flex gap-2 mb-4 flex-wrap">
        {(
          [
            ["posts", "ประกาศ"],
            ["applications", "ใบสมัครงาน"],
            ["complaints", "เรื่องร้องเรียน"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <Button key={k} variant={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>
            {label}
          </Button>
        ))}
      </div>
      {!selected ? (
        <p className="text-ink-soft text-sm">เลือกตำบลด้านบนก่อน</p>
      ) : tab === "posts" ? (
        <PostsTab key={selected.id} tambonId={selected.id} slug={selected.slug} />
      ) : tab === "applications" ? (
        <ApplicationsTab key={selected.id} tambonId={selected.id} />
      ) : (
        <ComplaintsTab key={selected.id} tambonId={selected.id} />
      )}
    </div>
  );
}

function PostsTab({ tambonId, slug }: { tambonId: string; slug: string | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tambon_board_posts")
      .select("*")
      .eq("tambon_id", tambonId)
      .order("created_at", { ascending: false })
      .limit(100);
    const ids = (data ?? []).map((p) => p.id);
    const { data: contacts } = ids.length
      ? await supabase.from("tambon_board_contacts").select("*").in("post_id", ids)
      : { data: [] as Tables<"tambon_board_contacts">[] };
    const byId = Object.fromEntries((contacts ?? []).map((c) => [c.post_id, c]));
    // รออนุมัติขึ้นก่อน
    const order = { pending: 0, approved: 1, rejected: 2, closed: 3 } as Record<string, number>;
    setPosts(
      (data ?? [])
        .map((p) => ({ ...p, contact: byId[p.id] ?? null }))
        .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    );
    setLoading(false);
  }, [tambonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function review(p: Post, action: "approve" | "reject" | "close") {
    const { error } = await createClient().rpc("admin_review_board_post", {
      p_id: p.id,
      p_action: action,
      p_reason: action === "reject" ? reason[p.id] ?? "" : undefined,
    });
    setMsg(error ? `ทำไม่สำเร็จ: ${error.message}` : "");
    load();
  }

  if (loading) return <p className="text-ink-soft text-sm">กำลังโหลด…</p>;

  return (
    <div className="flex flex-col gap-3">
      {slug && (
        <p className="text-xs text-ink-soft">
          ลิงก์ฟอร์มให้หน่วยงาน/ร้านค้าลงประกาศฟรี: <span className="text-ink">/t/{slug}/post</span>
        </p>
      )}
      {msg && <p className="text-sm text-clay">{msg}</p>}
      {posts.length === 0 ? (
        <EmptyState>ยังไม่มีประกาศ</EmptyState>
      ) : (
        posts.map((p) => (
          <Card key={p.id} className={p.status === "pending" ? "border-clay" : ""}>
            <div className="text-xs text-ink-soft">
              #{p.id} · {p.kind === "job" ? "รับสมัครงาน" : "ประกาศ"} · {POST_STATUS[p.status]} · {dateStr(p.created_at)}
            </div>
            <div className="font-head font-semibold text-sm mt-0.5">{p.title}</div>
            <div className="text-xs text-ink-soft">
              {p.org_name} ({ORG_TYPE[p.org_type] ?? p.org_type})
            </div>
            {p.kind === "job" && (
              <div className="text-xs mt-1">
                {[p.job_positions && `${p.job_positions} อัตรา`, p.job_wage, p.job_location].filter(Boolean).join(" · ")}
              </div>
            )}
            {p.body && <p className="text-sm mt-1 whitespace-pre-line">{p.body}</p>}
            {p.link_url && (
              <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="text-indigo text-xs underline break-all">
                {p.link_url}
              </a>
            )}
            {p.contact && (
              <div className="text-xs mt-2 rounded-lg bg-surface-2 px-2 py-1.5">
                ผู้ติดต่อ (ไม่แสดงบนเว็บ): {p.contact.contact_name}
                {p.contact.contact_phone && (
                  <>
                    {" · "}
                    <a href={telHref(p.contact.contact_phone) ?? undefined} className="text-indigo">
                      {p.contact.contact_phone}
                    </a>
                  </>
                )}
                {p.contact.contact_email && ` · ${p.contact.contact_email}`}
                {p.kind === "job" && (
                  <div className="text-ink-soft mt-0.5">
                    {p.contact.employer_line_user_id
                      ? "นายจ้างผูก LINE แล้ว — ใบสมัครส่งเข้า LINE นายจ้างอัตโนมัติ"
                      : `นายจ้างยังไม่ผูก LINE (รหัส ${p.contact.link_code}) — ใบสมัครส่งถึงตัวแทน ให้โทรแจ้งนายจ้าง`}
                  </div>
                )}
              </div>
            )}
            {p.reject_reason && <p className="text-xs text-clay mt-1">เหตุผลที่ไม่อนุมัติ: {p.reject_reason}</p>}
            {p.status === "approved" && p.expires_at && (
              <p className="text-xs text-ink-soft mt-1">แสดงถึง {dateStr(p.expires_at)}</p>
            )}
            <div className="flex gap-2 flex-wrap mt-2">
              {p.status === "pending" && (
                <>
                  <Button onClick={() => review(p, "approve")}>อนุมัติขึ้นหน้า</Button>
                  <Input
                    placeholder="เหตุผลถ้าไม่อนุมัติ"
                    value={reason[p.id] ?? ""}
                    onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })}
                  />
                  <Button variant="secondary" onClick={() => review(p, "reject")} disabled={(reason[p.id] ?? "").trim().length < 5}>
                    ไม่อนุมัติ
                  </Button>
                </>
              )}
              {p.status === "approved" && (
                <Button variant="ghost" onClick={() => review(p, "close")}>
                  ปิดประกาศ
                </Button>
              )}
              {(p.status === "closed" || p.status === "rejected") && (
                <Button variant="ghost" onClick={() => review(p, "approve")}>
                  เปิดอีกครั้ง (30 วัน)
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function ApplicationsTab({ tambonId }: { tambonId: string }) {
  const [apps, setApps] = useState<(Application & { postTitle: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tambon_job_applications")
      .select("*")
      .eq("tambon_id", tambonId)
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((data ?? []).map((a) => a.post_id))];
    const { data: posts } = ids.length
      ? await supabase.from("tambon_board_posts").select("id, title").in("id", ids)
      : { data: [] as { id: number; title: string }[] };
    const titles = Object.fromEntries((posts ?? []).map((p) => [p.id, p.title]));
    setApps((data ?? []).map((a) => ({ ...a, postTitle: titles[a.post_id] ?? `ประกาศ #${a.post_id}` })));
    setLoading(false);
  }, [tambonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function setStatus(a: Application, status: string) {
    await createClient().from("tambon_job_applications").update({ status }).eq("id", a.id);
    load();
  }

  if (loading) return <p className="text-ink-soft text-sm">กำลังโหลด…</p>;
  if (apps.length === 0)
    return <EmptyState>ยังไม่มีใบสมัคร — คนหางานกด “สมัครงานนี้” บนหน้าตำบลแล้วกรอกต่อใน LINE</EmptyState>;

  return (
    <div className="flex flex-col gap-2">
      {apps.map((a) => (
        <Card key={a.id}>
          <div className="text-xs text-ink-soft">
            {a.postTitle} · {APP_STATUS[a.status]} · {dateStr(a.created_at)}
          </div>
          <div className="font-head font-semibold text-sm">
            {a.applicant_name} ·{" "}
            <a href={telHref(a.applicant_phone) ?? undefined} className="text-indigo">
              {a.applicant_phone}
            </a>
          </div>
          {a.note && <p className="text-sm">{a.note}</p>}
          <div className="flex gap-2 mt-2">
            {a.status !== "contacted" && (
              <Button variant="ghost" onClick={() => setStatus(a, "contacted")}>
                แจ้งนายจ้างแล้ว
              </Button>
            )}
            {a.status !== "closed" && (
              <Button variant="secondary" onClick={() => setStatus(a, "closed")}>
                ปิด
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ComplaintsTab({ tambonId }: { tambonId: string }) {
  const [rows, setRows] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_tambon_complaints", { p_tambon_id: tambonId });
    setErr(error ? error.message : "");
    setRows(data ?? []);
    setLoading(false);
  }, [tambonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  if (loading) return <p className="text-ink-soft text-sm">กำลังโหลด…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-soft">
        หน้าตำบลแสดงเฉพาะตัวเลขสถิติ และหัวเรื่องที่แก้แล้วซึ่งตัวแทนเขียนหัวเรื่องสาธารณะให้ (อย่าใส่ชื่อ บ้านเลขที่ หรือข้อมูลที่ระบุตัวผู้แจ้ง)
      </p>
      {err && <p className="text-sm text-clay">{err}</p>}
      {rows.length === 0 ? (
        <EmptyState>ยังไม่มีเรื่องร้องเรียนในตำบลนี้</EmptyState>
      ) : (
        rows.map((c) => <ComplaintCard key={c.id} c={c} onSaved={load} />)
      )}
    </div>
  );
}

function ComplaintCard({ c, onSaved }: { c: Complaint; onSaved: () => void }) {
  const [status, setStatus] = useState(c.status);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState(c.public_title ?? "");
  const [msg, setMsg] = useState("");
  const resolved = RESOLVED.includes(status);

  async function save() {
    const { error } = await createClient().rpc("admin_update_complaint", {
      p_id: c.id,
      p_status: status,
      p_note: note || undefined,
      p_public_title: resolved ? title : undefined,
    });
    setMsg(error ? `บันทึกไม่สำเร็จ: ${error.message}` : "บันทึกแล้ว");
    if (!error) {
      setNote("");
      onSaved();
    }
  }

  return (
    <Card>
      <div className="text-xs text-ink-soft">
        {c.ticket_no} · {COMPLAINT_STATUS[c.status] ?? c.status} · {dateStr(c.created_at)}
        {c.is_test && " · ทดสอบ"}
        {c.urgency && ` · ความเร่งด่วน ${c.urgency}`}
      </div>
      <div className="font-head font-semibold text-sm">{c.subject || c.ai_summary || "ไม่มีหัวเรื่อง"}</div>
      {c.category && <div className="text-xs text-ink-soft">{c.category}</div>}
      {c.place && <div className="text-xs">สถานที่: {c.place}</div>}
      <p className="text-sm mt-1 whitespace-pre-line">{c.detail}</p>
      {c.suggested_agency && <p className="text-xs text-ink-soft mt-1">AI แนะนำหน่วยงาน: {c.suggested_agency}</p>}
      <p className="text-xs text-ink-soft mt-1">
        ผู้แจ้ง:{" "}
        {c.reporter_name || c.reporter_phone ? (
          <>
            {c.reporter_name}{" "}
            {c.reporter_phone && (
              <a href={telHref(c.reporter_phone) ?? undefined} className="text-indigo">
                {c.reporter_phone}
              </a>
            )}
          </>
        ) : (
          "ไม่เปิดเผยตัวตน"
        )}
      </p>
      <div className="mt-3 grid gap-2">
        <Field label="สถานะ">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            {Object.entries(COMPLAINT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หมายเหตุถึงผู้แจ้ง (เว้นว่างได้)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {resolved && (
          <Field label="หัวเรื่องที่แสดงบนหน้าตำบล (เว้นว่าง = ไม่แสดง)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ไฟทางซอย 5 ดับ — ซ่อมแล้ว" />
          </Field>
        )}
        <div>
          <Button onClick={save}>บันทึก</Button>
          {msg && <span className="text-sm ml-2">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}
