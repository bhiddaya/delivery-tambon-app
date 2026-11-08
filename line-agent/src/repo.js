// ทำงานกับ git แบบไม่ผ่าน shell (ส่ง args เป็นอาร์เรย์) และแยกพื้นที่งานต่อ 1 คำสั่ง
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { safeRepoPath, safeWritePath, MAX_FILE_BYTES, MAX_WRITE_FILES } from './guard.js';

const exec = promisify(execFile);
const GIT_IDENTITY = ['-c', 'user.name=LINE Agent', '-c', 'user.email=line-agent@users.noreply.github.com'];

async function git(args, cwd) {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function visible(file) {
  try {
    safeRepoPath(file);
    return true;
  } catch {
    return false;
  }
}

export class Repo {
  constructor(cfg) {
    this.cfg = cfg;
    this.dir = cfg.repoDir;
    // repo เป็น public จึง clone ได้โดยไม่ต้องมี token (token ใช้ตอน push และเปิด PR เท่านั้น)
    this.remote = cfg.githubToken
      ? `https://x-access-token:${cfg.githubToken}@github.com/${cfg.githubRepo}.git`
      : `https://github.com/${cfg.githubRepo}.git`;
    this.cloned = null;
  }

  ensureClone() {
    if (!this.cloned) {
      this.cloned = this.clone().catch((e) => {
        this.cloned = null;
        throw e;
      });
    }
    return this.cloned;
  }

  async clone() {
    const hasGit = await fs.stat(path.join(this.dir, '.git')).then(() => true, () => false);
    if (!hasGit) {
      await fs.mkdir(path.dirname(this.dir), { recursive: true });
      await exec('git', ['clone', '--quiet', this.remote, this.dir], { maxBuffer: 16 * 1024 * 1024 });
    }
  }

  // พื้นที่งานของหนึ่งคำสั่ง: worktree จาก origin/main ใหม่ทุกครั้ง ไม่แตะ working tree อื่น
  async openTask(taskId) {
    await this.ensureClone();
    await git(['fetch', '--quiet', 'origin', this.cfg.baseBranch], this.dir);
    const branch = `line-agent/${taskId}`;
    const dir = path.join(path.dirname(this.dir), 'tasks', taskId);
    await git(['worktree', 'add', '-q', '-b', branch, dir, `origin/${this.cfg.baseBranch}`], this.dir);
    return { dir, branch };
  }

  async closeTask(task) {
    await git(['worktree', 'remove', '--force', task.dir], this.dir).catch(() => {});
    await git(['branch', '-D', task.branch], this.dir).catch(() => {});
    await git(['worktree', 'prune'], this.dir).catch(() => {});
  }
}

export async function readFile(dir, p) {
  const rel = safeRepoPath(p);
  const full = path.join(dir, rel);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error('ไม่ใช่ไฟล์');
  const buf = await fs.readFile(full);
  const text = buf.subarray(0, MAX_FILE_BYTES).toString('utf8');
  return buf.length > MAX_FILE_BYTES ? `${text}\n…(ตัดที่ ${MAX_FILE_BYTES} ไบต์)` : text;
}

export async function listFiles(dir, pattern) {
  const pat = String(pattern || '').trim();
  if (!pat || pat.length > 120 || pat.includes('..') || pat.startsWith('/')) {
    throw new Error('pattern ไม่ถูกต้อง');
  }
  const files = (await git(['ls-files', '--', pat], dir)).split('\n').filter(Boolean).filter(visible);
  const shown = files.slice(0, 200).join('\n');
  return files.length > 200 ? `${shown}\n…(มี ${files.length} ไฟล์ แสดง 200)` : shown || 'ไม่พบ';
}

export async function searchCode(dir, query, glob) {
  const q = String(query || '').trim();
  if (!q || q.length > 120) throw new Error('query ไม่ถูกต้อง');
  const args = ['grep', '-n', '-I', '-E', '--no-color', '-e', q, '--'];
  if (glob) {
    if (String(glob).includes('..')) throw new Error('glob ไม่ถูกต้อง');
    args.push(String(glob));
  }
  let out = '';
  try {
    out = await git(args, dir);
  } catch (e) {
    if (e.code === 1) return 'ไม่พบ';
    throw e;
  }
  const lines = out.split('\n').filter(Boolean).filter((l) => visible(l.split(':')[0]));
  if (lines.length === 0) return 'ไม่พบ';
  const shown = lines.slice(0, 120).join('\n');
  return lines.length > 120 ? `${shown}\n…(มี ${lines.length} บรรทัด แสดง 120)` : shown;
}

export async function writeFile(dir, p, content) {
  const rel = safeWritePath(p);
  const text = String(content ?? '');
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('ไฟล์ใหญ่เกินกำหนด');
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, text, 'utf8');
  return rel;
}

// commit ไฟล์ที่เขียนไว้ push branch ใหม่ แล้วเปิด PR แบบ draft (ไม่ merge)
export async function openDraftPR(task, { title, summary }, cfg, fetchImpl = fetch) {
  const status = await git(['status', '--porcelain'], task.dir);
  const files = status.split('\n').filter(Boolean).map((l) => l.slice(3).trim());
  if (files.length === 0) throw new Error('ยังไม่มีไฟล์ที่แก้ ต้องเขียนไฟล์ก่อน');
  if (files.length > MAX_WRITE_FILES) throw new Error(`แก้ได้ไม่เกิน ${MAX_WRITE_FILES} ไฟล์`);
  const checked = files.map((f) => safeWritePath(f));
  await git(['add', '--', ...checked], task.dir);
  await git([...GIT_IDENTITY, 'commit', '-q', '-m', title], task.dir);
  await git(['push', '-q', '-u', 'origin', task.branch], task.dir);
  const res = await fetchImpl(`https://api.github.com/repos/${cfg.githubRepo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      head: task.branch,
      base: cfg.baseBranch,
      body: `${summary}\n\nร่างจาก LINE Agent (ระยะที่ 1) ยังไม่ merge และยังไม่ deploy`,
      draft: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`เปิด PR ไม่ได้ (${res.status}) ${json.message || ''}`.trim());
  return json.html_url;
}
