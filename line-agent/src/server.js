// HTTP รับเหตุการณ์จาก n8n: POST /line-event (ต้องมี x-bridge-secret) และ GET /health
import http from 'node:http';
import crypto from 'node:crypto';
import { staffLevel } from './auth.js';
import { pushText } from './line.js';
import { openRouterClient, runAgent } from './agent.js';
import { Repo } from './repo.js';
import { buildTools } from './tools.js';
import { handleEvent, createUsage } from './process.js';

export function secretOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 32 * 1024) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        resolve(null);
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

export function createServer(cfg, deps = {}) {
  const usage = createUsage(cfg.dailyLimit);
  const repo = new Repo(cfg);
  const client = deps.client || openRouterClient(cfg);
  const push = deps.push || ((to, text) => pushText(to, text, cfg));
  const level = deps.level || ((id) => staffLevel(id, cfg));
  const log = deps.log || ((obj) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })));

  // ทำทีละงาน กัน worktree ชนกันและกันค่าใช้จ่ายพุ่ง
  let chain = Promise.resolve();
  const serial = (fn) => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };

  const runTaskFor = () => async (task) => {
    const taskId = crypto.randomUUID().slice(0, 8);
    const t = await repo.openTask(taskId);
    try {
      const tools = buildTools({ cfg, task: t });
      const out = await runAgent({ cfg, client, task, tools });
      return { text: out.text, prUrl: tools.state.prUrl, steps: out.steps };
    } finally {
      await repo.closeTask(t);
    }
  };

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/line-event') return sendJson(res, 404, { error: 'not_found' });
    if (!secretOk(req.headers['x-bridge-secret'], cfg.bridgeSecret)) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    const evt = await readJson(req);
    if (!evt) return sendJson(res, 400, { error: 'bad_json' });

    sendJson(res, 202, { accepted: true });
    serial(() =>
      handleEvent(evt, { cfg, level, push, runTask: runTaskFor(), usage, log }),
    ).catch((e) => log({ event: 'crash', error: String(e.message || e).slice(0, 200) }));
  });
}
