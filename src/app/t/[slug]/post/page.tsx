"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { lineOaTextLink } from "@/lib/tambon-links";

type Kind = "job" | "announcement";

const ORG_TYPES: [string, string][] = [
  ["government", "หน่วยงานรัฐ / ท้องถิ่น / โรงเรียน"],
  ["private", "บริษัท / ร้านค้า / โรงงาน"],
  ["community", "ชุมชน / วัด / กลุ่มอาสา"],
  ["other", "อื่น ๆ"],
];

/**
 * ฟอร์มลงประกาศฟรีบนหน้าตำบล (D52) — ไม่ต้องล็อกอิน
 * ส่งแล้วรอตัวแทนตำบลอนุมัติก่อนขึ้นหน้า · เบอร์/อีเมลไม่แสดงบนเว็บ
 * ประกาศงาน: ได้รหัสไว้ผูก LINE นายจ้าง เพื่อรับใบสมัครทาง LINE
 */
export default function BoardPostForm() {
  const { slug } = useParams<{ slug: string }>();
  const [kind, setKind] = useState<Kind>("job");
  const [f, setF] = useState<Record<string, string>>({ org_type: "private" });
  const [website, setWebsite] = useState(""); // กับดักบอท: คนจริงไม่เห็นช่องนี้
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: number; link_code: string } | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    if (website) return; // บอทกรอกช่องที่ซ่อนไว้
    setBusy(true);
    setErr("");
    const { data, error } = await createClient().rpc("submit_board_post", {
      p_tambon_slug: slug,
      p_post: { ...f, kind },
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data as { id: number; link_code: string });
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <Card>
          <h1 className="font-head font-bold text-lg">ส่งประกาศแล้ว</h1>
          <p className="text-sm mt-2">ตัวแทนตำบลจะตรวจและอนุมัติก่อนขึ้นหน้าตำบล ประกาศแสดง 30 วันนับจากวันอนุมัติ</p>
          {kind === "job" && (
            <div className="mt-4 rounded-xl bg-indigo-tint px-3 py-3">
              <p className="text-sm font-semibold">รับใบสมัครทาง LINE</p>
              <p className="text-sm mt-1">
                รหัสนายจ้างของคุณ: <span className="font-mono font-bold">{done.link_code}</span>
              </p>
              <p className="text-xs text-ink-soft mt-1">
                กดปุ่มด้านล่างเพื่อส่งรหัสเข้า LINE บวรไทย เมื่อมีคนสมัคร ระบบจะส่งข้อมูลผู้สมัครให้คุณทาง LINE
                (ถ้าไม่ผูก LINE ตัวแทนตำบลจะโทรแจ้ง)
              </p>
              <a
                href={lineOaTextLink(`ยืนยันนายจ้าง ${done.link_code}`)}
                className="block text-center bg-[#06C755] text-white rounded-xl py-2.5 text-sm font-semibold mt-3"
              >
                ผูก LINE รับใบสมัคร
              </a>
            </div>
          )}
          <Link href={`/t/${slug}`} className="block text-center text-indigo font-semibold text-sm mt-4">
            กลับหน้าตำบล
          </Link>
        </Card>
      </main>
    );
  }

  const ready =
    (f.org_name ?? "").trim().length >= 2 &&
    (f.title ?? "").trim().length >= 3 &&
    (f.contact_name ?? "").trim().length >= 2 &&
    ((f.contact_phone ?? "").replace(/\D/g, "").length >= 9 || (f.contact_email ?? "").includes("@"));

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href={`/t/${slug}`} className="text-indigo text-sm font-semibold">
        ‹ หน้าตำบล
      </Link>
      <h1 className="text-xl font-head font-bold mt-2">ลงประกาศฟรี</h1>
      <p className="text-ink-soft text-sm mb-4">
        ประกาศรับสมัครงาน หรือประกาศข่าวจากหน่วยงานรัฐ เอกชน และชุมชน — ตัวแทนตำบลตรวจก่อนขึ้นหน้า
      </p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Button variant={kind === "job" ? "primary" : "ghost"} onClick={() => setKind("job")}>
          รับสมัครงาน
        </Button>
        <Button variant={kind === "announcement" ? "primary" : "ghost"} onClick={() => setKind("announcement")}>
          ประกาศข่าว
        </Button>
      </div>

      <Card>
        <Field label="ชื่อหน่วยงาน / ร้าน / บริษัท">
          <Input value={f.org_name ?? ""} onChange={set("org_name")} maxLength={120} />
        </Field>
        <Field label="ประเภท">
          <select
            value={f.org_type}
            onChange={set("org_type")}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            {ORG_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={kind === "job" ? "ตำแหน่งที่รับสมัคร" : "หัวข้อประกาศ"}>
          <Input
            value={f.title ?? ""}
            onChange={set("title")}
            maxLength={120}
            placeholder={kind === "job" ? "เช่น พนักงานเสิร์ฟ / พนักงานฝ่ายผลิต" : "เช่น เปิดรับสมัครอบรมอาชีพฟรี"}
          />
        </Field>
        {kind === "job" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="จำนวน (อัตรา)">
              <Input inputMode="numeric" value={f.job_positions ?? ""} onChange={set("job_positions")} maxLength={3} />
            </Field>
            <Field label="ค่าจ้าง">
              <Input value={f.job_wage ?? ""} onChange={set("job_wage")} maxLength={120} placeholder="เช่น 400 บาท/วัน" />
            </Field>
          </div>
        )}
        {kind === "job" && (
          <Field label="สถานที่ทำงาน">
            <Input value={f.job_location ?? ""} onChange={set("job_location")} maxLength={200} />
          </Field>
        )}
        <Field label={kind === "job" ? "รายละเอียดงาน คุณสมบัติ เวลาทำงาน" : "รายละเอียด"}>
          <Textarea rows={4} value={f.body ?? ""} onChange={set("body")} maxLength={2000} />
        </Field>
        {kind === "announcement" && (
          <Field label="ลิงก์ประกอบ (เว้นว่างได้)">
            <Input value={f.link_url ?? ""} onChange={set("link_url")} placeholder="https://" maxLength={500} />
          </Field>
        )}

        <div className="mt-2 pt-3 border-t border-border">
          <p className="text-xs text-ink-soft mb-2">ข้อมูลติดต่อ — ให้ตัวแทนตำบลใช้ตรวจสอบ ไม่แสดงบนเว็บ</p>
          <Field label="ชื่อผู้ติดต่อ">
            <Input value={f.contact_name ?? ""} onChange={set("contact_name")} maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="เบอร์โทร">
              <Input inputMode="tel" value={f.contact_phone ?? ""} onChange={set("contact_phone")} maxLength={20} />
            </Field>
            <Field label="อีเมล (ถ้ามี)">
              <Input type="email" value={f.contact_email ?? ""} onChange={set("contact_email")} maxLength={200} />
            </Field>
          </div>
        </div>
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          name="website"
        />
        {err && <p className="text-sm text-clay mb-2">{err}</p>}
        <Button onClick={submit} disabled={busy || !ready} className="w-full">
          {busy ? "กำลังส่ง…" : "ส่งประกาศ (ฟรี)"}
        </Button>
      </Card>
    </main>
  );
}
