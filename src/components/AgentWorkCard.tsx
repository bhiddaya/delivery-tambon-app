"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORK_CATEGORIES, WORK_STATES, type WorkItem, type WorkEvent } from "@/lib/agent-dashboard";
import { inputClass, secondaryButton, primaryButton } from "@/rebuilt/primitives";

export default function AgentWorkCard({ task, events, onSaved }: { task: WorkItem; events: WorkEvent[]; onSaved: () => void }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [retry, setRetry] = useState(false); const pending = useRef<{ p_task_id: string; p_request_id: string; p_version: number; p_action: string; p_note: string } | null>(null);
  async function update(action: string) {
    if (busy) return;
    if (!pending.current) pending.current = { p_task_id: task.id, p_request_id: crypto.randomUUID(), p_version: task.version, p_action: action, p_note: note.trim() };
    setBusy(true); setError("");
    try {
      const result = await createClient().rpc("agent_work_update", pending.current);
      if (result.error) {
        if (["PT409", "40001", "42501", "22023"].includes(result.error.code)) { pending.current = null; setRetry(false); onSaved(); }
        else setRetry(true);
        throw new Error(["PT409", "40001"].includes(result.error.code) ? "มีผู้แก้ไขแล้ว ข้อมูลกำลังอัปเดต ตรวจอีกครั้งก่อนกด" : "ยังบันทึกไม่ได้ ตรวจการเชื่อมต่อและสิทธิ์แล้วลองอีกครั้ง");
      }
      pending.current = null; setRetry(false); setNote(""); onSaved();
    } catch (e) { if (pending.current) setRetry(true); setError(e instanceof Error ? e.message : "ยังบันทึกไม่ได้"); }
    finally { setBusy(false); }
  }
  return <article className={`rounded-2xl border bg-surface p-5 ${task.status === "waiting" ? "border-marigold" : "border-border"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs text-ink-soft">{WORK_CATEGORIES[task.category]}{task.order_id ? ` · ออเดอร์ #${task.order_id}` : ""}</p><h3 className="mt-2 break-words text-lg font-semibold">{task.title}</h3></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs ${task.status === "done" ? "bg-jade-tint text-jade" : "bg-indigo-tint text-indigo"}`}>{WORK_STATES[task.status]}</span></div>
    {task.detail && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-soft">{task.detail}</p>}
    {task.due_on && <p className="mt-2 text-xs text-ink-soft">กำหนด {new Date(`${task.due_on}T00:00:00+07:00`).toLocaleDateString("th-TH")}</p>}
    <label className="mt-4 block"><span className="mb-2 block text-sm">บันทึกความคืบหน้า / สิ่งที่รอ</span><textarea className={inputClass} maxLength={2000} rows={2} value={note} disabled={busy || retry} onChange={e => setNote(e.target.value)} placeholder="เช่น ประสานร้านแล้ว รอแจ้งเวลาพร้อมรับ" /></label>
    <div className="mt-3 flex flex-wrap gap-2">
      {retry ? <button className={primaryButton} disabled={busy} onClick={() => update("note")}>ลองบันทึกเดิมอีกครั้ง</button> : <>
        {task.status !== "done" && task.status !== "doing" && <button className={secondaryButton} disabled={busy} onClick={() => update("start")}>เริ่มทำ</button>}
        {task.status !== "done" && <button className={secondaryButton} disabled={busy || note.trim().length < 5} onClick={() => update("wait")}>รอประสาน</button>}
        {task.status !== "done" ? <button className={primaryButton} disabled={busy} onClick={() => update("done")}>งานนี้เสร็จแล้ว</button> : <button className={secondaryButton} disabled={busy} onClick={() => update("reopen")}>เปิดงานต่อ</button>}
        <button className={secondaryButton} disabled={busy || note.trim().length < 3} onClick={() => update("note")}>บันทึกความคืบหน้า</button>
      </>}
    </div>
    {busy && <p role="status" className="mt-3 text-sm">กำลังบันทึก…</p>}{error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer text-ink-soft">ประวัติงาน</summary><ol className="mt-3 space-y-3">{events.map(e => <li key={e.id} className="border-l-2 border-border pl-3"><p className="text-xs text-ink-soft">{new Date(e.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {WORK_STATES[e.status]}</p><p className="mt-1 whitespace-pre-wrap">{e.note || "อัปเดตสถานะงาน"}</p></li>)}</ol></details>
  </article>;
}
