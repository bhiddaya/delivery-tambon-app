import { createClient } from "@/lib/supabase/client";

export const WORK_STATES = { todo: "ยังไม่เริ่ม", doing: "กำลังทำ", waiting: "รอประสาน", done: "เสร็จแล้ว" } as const;
export const WORK_CATEGORIES = { orders: "ออเดอร์", shops: "ร้านค้า", drivers: "ไรเดอร์", finance: "การเงิน", members: "สมาชิก", coordination: "ประสานงาน" } as const;
export type WorkStatus = keyof typeof WORK_STATES;
export type WorkCategory = keyof typeof WORK_CATEGORIES;
export type WorkItem = { id: string; tambon_id: string; title: string; detail: string; status: WorkStatus; category: WorkCategory; due_on: string | null; order_id: number | null; version: number; updated_at: string };
export type WorkEvent = { id: string; task_id: string; action: string; status: WorkStatus; note: string; created_at: string };
export type AgentArea = { id: string; name: string; slug: string };
export type AgentData = { area: AgentArea & { intake_blocked: boolean }; counts: Record<string, number>; task_counts: Record<WorkStatus, number>; tasks: WorkItem[]; events: WorkEvent[]; orders: { id: number; type: string; status: string; paid: boolean; needs_payment: boolean; shop_accepted: boolean; food_ready: boolean; driver_assigned: boolean; is_drill?: boolean; created_at: string }[] };
export async function loadAgentDashboard(selected: string, status = "open", offset = 0): Promise<{ areas: AgentArea[]; dashboard: AgentData | null }> {
  const db = createClient(); const areas = await db.rpc("agent_dashboard_areas");
  if (areas.error) throw new Error("โหลดพื้นที่ที่ดูแลไม่สำเร็จ");
  const list = areas.data as unknown as AgentArea[];
  const area = selected ? list.find(a => a.id === selected || a.slug === selected) : list[0];
  if (selected && !area) throw new Error("ไม่มีสิทธิ์ในพื้นที่นี้");
  if (!area) return { areas: list, dashboard: null };
  const data = await db.rpc("agent_dashboard", { p_tambon_id: area.id, p_status: status, p_offset: offset });
  if (data.error) throw new Error("โหลดข้อมูลตำบลไม่สำเร็จ");
  return { areas: list, dashboard: data.data as unknown as AgentData };
}
export async function syncAgentMemory(tambonId: string): Promise<{ verified: boolean; checked_at: string; revision: string }> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const response = await fetch("https://bavorn-ai-dashboard.bhiddaya.workers.dev/api/tambon-memory/sync", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ tambonId }), signal: AbortSignal.timeout(115_000), redirect: "error", cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || result.verified !== true) throw new Error("รอเชื่อมความจำส่วนกลาง บันทึกงานในตำบลยังอยู่");
  return result;
}
