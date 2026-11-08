// ตรวจระดับผู้ดูแลจาก LINE ID ฝั่งเซิร์ฟเวอร์เอง (ไม่เชื่อค่าที่ n8n ส่งมา)
// fail closed: อ่านไม่ได้หรือไม่พบ = ไม่มีสิทธิ์
export async function staffLevel(lineUserId, cfg, fetchImpl = fetch) {
  if (!lineUserId) return null;
  try {
    const res = await fetchImpl(`${cfg.supabaseUrl}/rest/v1/rpc/line_staff_level`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseKey,
        Authorization: `Bearer ${cfg.supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_line_user_id: String(lineUserId) }),
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
