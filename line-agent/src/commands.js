// แยกคำสั่งจากข้อความ LINE: "งาน <คำสั่ง>" หรือ "งาน: <คำสั่ง>"
export function parseCommand(text) {
  const s = String(text ?? '').trim();
  if (/^งาน(ช่วยเหลือ|help)$/i.test(s)) return { kind: 'help' };
  const m = s.match(/^งาน[\s:：]+([\s\S]+)$/);
  if (!m) return { kind: 'ignore' };
  const task = m[1].trim();
  if (!task) return { kind: 'help' };
  return { kind: 'task', task: task.slice(0, 2000) };
}

export const HELP_TEXT = [
  'สั่งงานพัฒนาได้ด้วยข้อความขึ้นต้นว่า "งาน" เช่น',
  '• งาน: ตรวจว่าหน้าสถานะตำบลอ่านข้อมูลจากไหน',
  '• งาน: เสนอแก้ข้อความบนหน้าร้านให้ชัดขึ้น แล้วร่าง PR',
  '',
  'ระยะที่ 1: อ่านโค้ด ค้นหา และอธิบายได้เลย ถ้าขอให้แก้ จะร่าง PR แบบ draft ให้เจ้าของตรวจบน PC',
  'ยังไม่รองรับ: แก้ฐานข้อมูล migration n8n การ deploy และการ merge',
].join('\n');
