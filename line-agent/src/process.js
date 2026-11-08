// ประมวลผลข้อความ 1 ข้อความ: ตรวจสิทธิ์ โควตา สั่ง agent แล้วส่งผลกลับ LINE
import crypto from 'node:crypto';
import { parseCommand, HELP_TEXT } from './commands.js';
import { isAllowed } from './auth.js';

export function hashId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 10);
}

export function createUsage(limit, now = () => new Date()) {
  const counts = new Map();
  return {
    take(userId) {
      const key = `${userId}|${now().toISOString().slice(0, 10)}`;
      const n = counts.get(key) || 0;
      if (n >= limit) return false;
      counts.set(key, n + 1);
      return true;
    },
  };
}

export async function handleEvent(evt, { cfg, level, push, runTask, usage, log = () => {} }) {
  const cmd = parseCommand(evt?.text);
  if (cmd.kind === 'ignore') return 'ignored';
  if (!evt?.userId) return 'no_user';
  const who = hashId(evt.userId);

  if (cmd.kind === 'help') {
    await push(evt.userId, HELP_TEXT);
    return 'help';
  }

  const lv = await level(evt.userId);
  if (!isAllowed(lv, cfg)) {
    await push(evt.userId, 'บัญชีนี้ยังไม่มีสิทธิ์สั่งงานผ่าน LINE ครับ');
    log({ event: 'denied', user: who, level: lv || null });
    return 'denied';
  }

  if (!usage.take(evt.userId)) {
    await push(evt.userId, `วันนี้ใช้โควตาสั่งงานครบ ${cfg.dailyLimit} ครั้งแล้วครับ`);
    log({ event: 'limit', user: who });
    return 'limit';
  }

  await push(evt.userId, 'รับงานแล้ว กำลังตรวจและทำงาน ผลจะส่งมาในข้อความนี้ครับ');
  try {
    const r = await runTask(cmd.task);
    const text = r.prUrl ? `${r.text}\n\nร่าง PR (draft): ${r.prUrl}` : r.text;
    await push(evt.userId, text);
    log({ event: 'done', user: who, level: lv, steps: r.steps, pr: Boolean(r.prUrl) });
    return 'done';
  } catch (e) {
    await push(evt.userId, `ทำงานไม่สำเร็จ: ${e.message}`);
    log({ event: 'failed', user: who, error: String(e.message || e).slice(0, 200) });
    return 'failed';
  }
}
