/** API ระบบปลูกต้นไม้ตำบล อยู่บน n8n (workflow 6v42EaBpsSPezH0d) — ตรวจ LIFF access token เอง URL ไม่ใช่ความลับ */
export const TREE_API = "https://srv2091778.hstgr.cloud/webhook";

export type TreeReview = { id: string; decision: "approve" | "reject" };

/** ลิงก์จากการ์ดแจ้งผู้อนุมัติ: ?approve=1&id=<uuid>&d=approve|reject — อย่างอื่นเป็นหน้าฟอร์มปลูกปกติ */
export function treeReviewParams(search: string): TreeReview | null {
  const p = new URLSearchParams(search);
  const id = p.get("id") ?? "";
  const decision = p.get("d");
  if (p.get("approve") !== "1" || !/^[0-9a-f-]{36}$/.test(id)) return null;
  if (decision !== "approve" && decision !== "reject") return null;
  return { id, decision };
}
