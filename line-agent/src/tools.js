// เครื่องมือที่ agent ใช้ได้ในระยะที่ 1 (ไม่มี shell, ไม่มีการเขียนฐานข้อมูล, ไม่ publish, ไม่ merge)
import { readFile, listFiles, searchCode, writeFile, openDraftPR } from './repo.js';
import { MAX_WRITE_FILES } from './guard.js';

export function buildTools({ cfg, task, fetchImpl = fetch }) {
  const state = { written: new Set(), prUrl: null };

  const defs = [
    {
      name: 'read_file',
      description: 'อ่านไฟล์ในโปรเจกต์ ระบุ path สัมพัทธ์จากราก เช่น src/app/page.tsx',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
      name: 'list_files',
      description: 'ดูรายชื่อไฟล์ที่ตรงกับ pattern แบบ git pathspec เช่น src/**/*.tsx',
      input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    },
    {
      name: 'search_code',
      description: 'ค้นข้อความหรือ regex (ERE) ในโค้ด คืนผลเป็น ไฟล์:บรรทัด:ข้อความ',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' }, glob: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'write_file',
      description: `เขียนไฟล์ในพื้นที่งาน ยังไม่ commit ได้เฉพาะ src/ และ docs/ ไม่เกิน ${MAX_WRITE_FILES} ไฟล์ ใช้เมื่อผู้สั่งขอให้แก้เท่านั้น`,
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
    {
      name: 'create_draft_pr',
      description: 'commit ไฟล์ที่เขียนไว้ push branch ใหม่ แล้วเปิด PR แบบ draft เรียกได้ครั้งเดียวต่องาน',
      input_schema: {
        type: 'object',
        properties: { title: { type: 'string' }, summary: { type: 'string' } },
        required: ['title', 'summary'],
      },
    },
  ];

  const handlers = {
    read_file: ({ path }) => readFile(task.dir, path),
    list_files: ({ pattern }) => listFiles(task.dir, pattern),
    search_code: ({ query, glob }) => searchCode(task.dir, query, glob),
    write_file: async ({ path, content }) => {
      if (!state.written.has(path) && state.written.size >= MAX_WRITE_FILES) {
        throw new Error(`แก้ได้ไม่เกิน ${MAX_WRITE_FILES} ไฟล์ต่องาน`);
      }
      const rel = await writeFile(task.dir, path, content);
      state.written.add(rel);
      return `เขียนแล้ว ${rel} (ยังไม่ commit)`;
    },
    create_draft_pr: async ({ title, summary }) => {
      if (state.prUrl) throw new Error('งานนี้เปิด PR ไปแล้ว');
      if (state.written.size === 0) throw new Error('ยังไม่ได้เขียนไฟล์ จึงยังไม่เปิด PR');
      state.prUrl = await openDraftPR(
        task,
        { title: String(title || 'LINE Agent draft').slice(0, 120), summary: String(summary || '').slice(0, 4000) },
        cfg,
        fetchImpl,
      );
      return `เปิด PR แบบ draft แล้ว: ${state.prUrl}`;
    },
  };

  return { defs, handlers, state };
}
