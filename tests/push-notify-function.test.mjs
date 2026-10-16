// Offline test of the edge function push-notify. Supabase and web-push are fakes; no network, no real push.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const require = createRequire(path.join(base, 'package.json'));
const out = path.join(base, 'node_modules/.cache/push-notify-function.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(base, 'supabase/functions/push-notify/index.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: out,
  plugins: [{ name: 'fakes', setup(b) {
    b.onResolve({ filter: /^(jsr:@supabase\/supabase-js@2|npm:web-push@3\.6\.7)$/ }, a => ({ path: a.path.startsWith('jsr') ? 'supabase' : 'webpush', namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, a => ({ loader: 'js', contents: a.path === 'supabase'
      ? 'export const createClient = () => globalThis.fakeAdmin;'
      : 'export default new Proxy({}, { get: (_, k) => globalThis.fakeWebpush[k] });' }));
  } }],
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k' };
globalThis.Deno = { env: { get: k => env[k] }, serve: h => { globalThis.handler = h; } };
require(out);

const SECRET = 'shared-secret';
const target = (id, kind) => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a', kind });
const baseOrder = { id: 7, type: 'food', is_test: false, is_drill: false, event: 'new', shop: 'ร้านไบดี', tambon: 'คลองกุ่ม' };
function setup({ keys = { public: 'PUB', private: 'PRIV', notify_secret: SECRET }, order = baseOrder, targets = [], failWith = {} } = {}) {
  const calls = { rpc: [], sent: [], vapid: null, generated: 0 };
  globalThis.fakeAdmin = { rpc: async (name, args) => {
    calls.rpc.push([name, args]);
    if (name === 'push_get_keys') return { data: keys, error: null };
    if (name === 'push_targets') return { data: { ok: true, order, targets }, error: null };
    return { data: 1, error: null };
  } };
  globalThis.fakeWebpush = {
    generateVAPIDKeys: () => { calls.generated++; return { publicKey: 'NEWPUB', privateKey: 'NEWPRIV' }; },
    setVapidDetails: (...a) => { calls.vapid = a; },
    sendNotification: async (sub, payload, opts) => {
      const t = targets.find(x => x.endpoint === sub.endpoint);
      if (failWith[t.id]) throw Object.assign(new Error('push failed'), { statusCode: failWith[t.id] });
      calls.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
    },
  };
  return calls;
}
const call = async (body, secret = SECRET) => {
  const res = await globalThis.handler(new Request('https://f.test/functions/v1/push-notify', { method: 'POST', headers: { 'x-notify-secret': secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

// 1) wrong or missing secret: nothing is looked up or sent
{
  const c = setup({ targets: [target('m1', 'merchant')] });
  assert.equal((await call({ order_id: 7, event: 'new' }, 'nope')).status, 401);
  assert.equal(c.sent.length, 0); assert.ok(!c.rpc.some(([n]) => n === 'push_targets'));
  setup({ keys: { public: 'PUB', private: 'PRIV', notify_secret: null } });
  assert.equal((await call({ order_id: 7, event: 'new' }, '')).status, 401);
}
// 2) init creates keys once and never returns the private key
{
  const c = setup({ keys: { public: null, private: null, notify_secret: SECRET } });
  const r = await call({ action: 'init' });
  assert.equal(r.status, 200); assert.equal(r.body.public, 'NEWPUB'); assert.equal(r.body.created, true);
  assert.ok(!JSON.stringify(r.body).includes('NEWPRIV'), 'private key never leaves the function');
  assert.deepEqual(c.rpc.find(([n]) => n === 'push_set_keys')[1], { p_public: 'NEWPUB', p_private: 'NEWPRIV' });
  const again = setup({});
  const r2 = await call({ action: 'init' });
  assert.equal(r2.body.created, false); assert.equal(again.generated, 0, 'existing keys are not replaced');
}
// 3) new order: one push per target, text and vibration differ by role, drill is labelled
{
  const c = setup({ order: { ...baseOrder, is_test: true, is_drill: true }, targets: [target('m1', 'merchant'), target('d1', 'driver'), target('a1', 'agent')] });
  const r = await call({ order_id: 7, event: 'new' });
  assert.equal(r.body.targets, 3); assert.equal(r.body.sent, 3); assert.equal(r.body.removed, 0);
  const by = Object.fromEntries(c.sent.map(s => [s.endpoint.split('/').pop(), s.payload]));
  assert.match(by.m1.title, /^\[ซ้อม\] 🛒 ออเดอร์ใหม่ #7/); assert.match(by.d1.title, /🛵 งานใหม่/); assert.match(by.a1.body, /ร้าน ร้านไบดี/);
  assert.equal(by.m1.url, '/merchant/orders'); assert.equal(by.d1.url, '/driver'); assert.equal(by.a1.url, '/admin/workspace');
  assert.notDeepEqual(by.m1.vibrate, by.d1.vibrate); assert.notDeepEqual(by.d1.vibrate, by.a1.vibrate);
  assert.equal(by.m1.tag, 'order-7-merchant');
  assert.deepEqual(c.vapid, ['https://delivery-tambon-app-v3.vercel.app', 'PUB', 'PRIV']);
  assert.equal(c.sent[0].opts.urgency, 'high');
}
// 4) paid event tells the shop to cook; a real order has no label
{
  const c = setup({ order: { ...baseOrder, id: 9, event: 'paid', shop: 'ร้าน', tambon: 'ต' }, targets: [target('m1', 'merchant')] });
  await call({ order_id: 9, event: 'paid' });
  assert.equal(c.sent[0].payload.title, '✅ ยืนยันเงินแล้ว #9'); assert.equal(c.sent[0].payload.body, 'เตรียมอาหารได้เลย');
}
// 5) dead devices (404/410) are removed; other failures are kept for the next time
{
  const c = setup({ targets: [target('ok', 'merchant'), target('gone', 'driver'), target('flaky', 'agent')], failWith: { gone: 410, flaky: 500 } });
  const r = await call({ order_id: 7, event: 'new' });
  assert.equal(r.body.sent, 1); assert.equal(r.body.removed, 1);
  assert.deepEqual(c.rpc.find(([n]) => n === 'push_delete_subscriptions')[1], { p_ids: ['gone'] });
}
// 6) dry run lists who would be told without sending; bad requests and missing keys are refused
{
  const c = setup({ targets: [target('m1', 'merchant'), target('m2', 'merchant'), target('d1', 'driver')] });
  const r = await call({ order_id: 7, event: 'new', dry_run: true });
  assert.deepEqual(r.body, { ok: true, dry_run: true, targets: 3, by_kind: { merchant: 2, driver: 1 } }); assert.equal(c.sent.length, 0);
  assert.equal((await call({ order_id: 'x', event: 'new' })).status, 400);
  assert.equal((await call({ order_id: 7, event: 'weird' })).status, 400);
  setup({ keys: { public: null, private: null, notify_secret: SECRET } });
  assert.equal((await call({ order_id: 7, event: 'new' })).status, 503);
}
console.log('PASS push-notify: secret check, keys never leak, role-specific payloads, dead devices removed, dry run');
