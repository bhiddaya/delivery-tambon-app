// ตรวจระดับผู้ดูแลจาก LINE ID ฝั่งเซิร์ฟเวอร์ (ผ่าน n8n ซึ่งเรียก line_staff_level ด้วย credential เดิม)
// fail closed: อ่านไม่ได้หรือไม่พบ = ไม่มีสิทธิ์
export async function staffLevel(lineUserId, cfg, fetchImpl = fetch) {
  if (!lineUserId) return null;
  try {
    const res = await fetchImpl(`${cfg.n8nUrl}/webhook/agent-staff-level`, {
      method: 'POST',
      headers: {
        'x-bridge-secret': cfg.bridgeSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: String(lineUserId) }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.level === 'string' ? json.level : null;
  } catch {
    return null;
  }
}

export function isAllowed(level, cfg) {
  return Boolean(level) && cfg.allowedLevels.includes(level);
}
