// ส่งข้อความกลับ LINE ด้วย push (reply token หมดอายุเร็วเกินไปสำหรับงานที่ใช้เวลานาน)
const MAX_TEXT = 4800;

export function clip(text, max = MAX_TEXT) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 20)}\n…(ตัดข้อความ)` : s;
}

export async function pushText(to, text, cfg, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.lineToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: clip(text) }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
