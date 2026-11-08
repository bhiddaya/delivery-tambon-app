// ส่งข้อความกลับ LINE ผ่าน n8n (ใช้ LINE credential เดิม) ด้วย push เพราะงานใช้เวลานานกว่า reply token
const MAX_TEXT = 4800;

export function clip(text, max = MAX_TEXT) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 20)}\n…(ตัดข้อความ)` : s;
}

export async function pushText(to, text, cfg, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${cfg.n8nUrl}/webhook/agent-push`, {
      method: 'POST',
      headers: {
        'x-bridge-secret': cfg.bridgeSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text: clip(text) }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json?.ok === true;
  } catch {
    return false;
  }
}
