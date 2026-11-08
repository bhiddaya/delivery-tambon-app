// กันเส้นทางไฟล์: อ่านได้เฉพาะในโปรเจกต์ เขียนได้เฉพาะ src/ และ docs/ ในระยะที่ 1
const DENY_READ = [
  /(^|\/)\.env/i,
  /\.(pem|key|p12|pfx)$/i,
  /secret/i,
  /service[-_]?role/i,
  /(^|\/)node_modules\//,
  /^\.git(\/|$)/,
  /(^|\/)\.claude\//,
];

const ALLOW_WRITE = [/^src\//, /^docs\//];

export const MAX_FILE_BYTES = 60 * 1024;
export const MAX_WRITE_FILES = 10;

export function safeRepoPath(p) {
  if (typeof p !== 'string') throw new Error('path ต้องเป็นข้อความ');
  const s = p.replace(/\\/g, '/').trim();
  if (!s || s.length > 300) throw new Error('path ไม่ถูกต้อง');
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.split('/').includes('..')) {
    throw new Error('path ต้องอยู่ในโปรเจกต์');
  }
  if (DENY_READ.some((r) => r.test(s))) throw new Error('ไม่อนุญาตให้อ่านไฟล์นี้');
  return s;
}

export function safeWritePath(p) {
  const s = safeRepoPath(p);
  if (!ALLOW_WRITE.some((r) => r.test(s))) {
    throw new Error('ระยะที่ 1 แก้ได้เฉพาะ src/ และ docs/ (migration, n8n และการ deploy ทำบน PC)');
  }
  return s;
}
