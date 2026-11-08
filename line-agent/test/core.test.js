import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands.js';
import { safeRepoPath, safeWritePath } from '../src/guard.js';
import { staffLevel, isAllowed } from '../src/auth.js';
import { runAgent } from '../src/agent.js';
import { handleEvent, createUsage } from '../src/process.js';
import { secretOk } from '../src/server.js';
import { loadConfig, missingSecrets } from '../src/config.js';

const cfg = loadConfig({
  BRIDGE_SECRET: 's',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  ANTHROPIC_API_KEY: 'a',
  GITHUB_TOKEN: 'g',
  LINE_CHANNEL_ACCESS_TOKEN: 'l',
  DAILY_TASK_LIMIT: '2',
  MAX_AGENT_STEPS: '3',
});

test('parseCommand: งาน: และ งาน เว้นวรรค', () => {
  assert.deepEqual(parseCommand('งาน: ตรวจหน้าสถานะ'), { kind: 'task', task: 'ตรวจหน้าสถานะ' });
  assert.deepEqual(parseCommand('งาน ตรวจหน้าสถานะ'), { kind: 'task', task: 'ตรวจหน้าสถานะ' });
  assert.deepEqual(parseCommand('งานช่วยเหลือ'), { kind: 'help' });
  assert.deepEqual(parseCommand('สวัสดี'), { kind: 'ignore' });
  assert.deepEqual(parseCommand('งาน'), { kind: 'ignore' });
});

test('safeRepoPath: กันทางออกนอกโปรเจกต์และไฟล์ลับ', () => {
  assert.equal(safeRepoPath('src/app/page.tsx'), 'src/app/page.tsx');
  assert.equal(safeRepoPath('src\\app\\a.ts'), 'src/app/a.ts');
  for (const bad of ['../x', '/etc/passwd', 'C:\\x', '.env.local', 'config/secret.json', 'node_modules/a.js', '.git/config']) {
    assert.throws(() => safeRepoPath(bad), undefined, bad);
  }
});

test('safeWritePath: เขียนได้เฉพาะ src/ และ docs/', () => {
  assert.equal(safeWritePath('src/x.ts'), 'src/x.ts');
  assert.equal(safeWritePath('docs/a.md'), 'docs/a.md');
  for (const bad of ['supabase/migrations/x.sql', 'n8n/line.json', 'package.json', 'line-agent/src/x.js']) {
    assert.throws(() => safeWritePath(bad), undefined, bad);
  }
});

test('staffLevel: เฉพาะระดับที่ได้รับอนุญาตผ่าน และ fail closed', async () => {
  const okFetch = (level) => async () => ({ ok: true, json: async () => ({ level }) });
  assert.equal(await staffLevel('U1', cfg, okFetch('admin')), 'admin');
  assert.equal(isAllowed('admin', cfg), true);
  assert.equal(isAllowed('superadmin', cfg), true);
  assert.equal(isAllowed('tambon_agent', cfg), false);
  assert.equal(isAllowed(null, cfg), false);

  assert.equal(await staffLevel('U1', cfg, async () => ({ ok: false, json: async () => ({}) })), null);
  assert.equal(await staffLevel('U1', cfg, async () => { throw new Error('down'); }), null);
  let called = false;
  assert.equal(await staffLevel('', cfg, async () => { called = true; }), null);
  assert.equal(called, false);
});

test('runAgent: เรียกเครื่องมือแล้วได้คำตอบสุดท้าย และส่งผลเครื่องมือกลับไป', async () => {
  const requests = [];
  const responses = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a.ts' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'เสร็จ' }] },
  ];
  const client = { messages: { create: async (body) => { requests.push(structuredClone(body)); return responses.shift(); } } };
  const seen = [];
  const tools = {
    defs: [],
    handlers: { read_file: async (input) => { seen.push(input.path); return 'DATA'; } },
  };
  const out = await runAgent({ cfg, client, task: 'อ่าน a.ts', tools });
  assert.equal(out.text, 'เสร็จ');
  assert.equal(out.steps, 2);
  assert.deepEqual(seen, ['a.ts']);
  const last = requests[1].messages.at(-1);
  assert.equal(last.role, 'user');
  assert.equal(last.content[0].type, 'tool_result');
  assert.equal(last.content[0].content, 'DATA');
  assert.equal(last.content[0].is_error, false);
});

test('runAgent: เครื่องมือ error ส่งกลับเป็น is_error และหยุดตามจำนวนขั้นตอน', async () => {
  const client = { messages: { create: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'nope', input: {} }] }) } };
  const out = await runAgent({ cfg, client, task: 't', tools: { defs: [], handlers: {} } });
  assert.equal(out.steps, cfg.maxSteps);
  assert.match(out.text, /หยุด/);
});

test('handleEvent: ไม่มีสิทธิ์ไม่รันงาน, มีสิทธิ์รันและส่งลิงก์ PR, โควตาครบแล้วหยุด', async () => {
  const pushed = [];
  const push = async (to, text) => pushed.push(text);
  let ran = 0;
  const runTask = async () => { ran += 1; return { text: 'ผล', prUrl: 'https://github.com/x/pull/1', steps: 2 }; };
  const usage = createUsage(2);
  const logs = [];
  const log = (o) => logs.push(o);

  const denied = await handleEvent({ userId: 'U_NO', text: 'งาน: ทำอะไรบางอย่าง' }, {
    cfg, level: async () => 'tambon_agent', push, runTask, usage, log,
  });
  assert.equal(denied, 'denied');
  assert.equal(ran, 0);

  const done = await handleEvent({ userId: 'U_OK', text: 'งาน: ตรวจ' }, {
    cfg, level: async () => 'admin', push, runTask, usage, log,
  });
  assert.equal(done, 'done');
  assert.equal(ran, 1);
  assert.ok(pushed.at(-1).includes('https://github.com/x/pull/1'));

  await handleEvent({ userId: 'U_OK', text: 'งาน: อีกงาน' }, { cfg, level: async () => 'admin', push, runTask, usage, log });
  const limited = await handleEvent({ userId: 'U_OK', text: 'งาน: เกินโควตา' }, { cfg, level: async () => 'admin', push, runTask, usage, log });
  assert.equal(limited, 'limit');
  assert.equal(ran, 2);
  assert.ok(logs.every((l) => !JSON.stringify(l).includes('U_OK')), 'userId ต้องไม่ปรากฏในล็อก');
});

test('handleEvent: งานล้มเหลวส่งข้อความสั้นกลับ', async () => {
  const pushed = [];
  const result = await handleEvent({ userId: 'U_OK', text: 'งาน: ลอง' }, {
    cfg,
    level: async () => 'superadmin',
    push: async (_, t) => pushed.push(t),
    runTask: async () => { throw new Error('เปิด PR ไม่ได้ (422)'); },
    usage: createUsage(5),
  });
  assert.equal(result, 'failed');
  assert.match(pushed.at(-1), /ทำงานไม่สำเร็จ: เปิด PR ไม่ได้/);
});

test('secretOk และ missingSecrets', () => {
  assert.equal(secretOk('abc', 'abc'), true);
  assert.equal(secretOk('abd', 'abc'), false);
  assert.equal(secretOk(undefined, 'abc'), false);
  assert.equal(secretOk('', ''), false);
  assert.deepEqual(missingSecrets(loadConfig({})).sort(), [
    'ANTHROPIC_API_KEY', 'BRIDGE_SECRET', 'GITHUB_TOKEN', 'LINE_CHANNEL_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY',
  ]);
});
