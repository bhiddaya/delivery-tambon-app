// Offline test of the Supabase edge function line-login (login mode). LINE and Supabase are fakes; no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const require = createRequire(path.join(base, 'package.json'));
const out = path.join(base, 'node_modules/.cache/line-login-function.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(base, 'supabase/functions/line-login/index.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: out,
  plugins: [{ name: 'jsr-fake', setup(b) {
    b.onResolve({ filter: /^jsr:@supabase\/supabase-js@2$/ }, () => ({ path: 'fake-supabase', namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ loader: 'js', contents: 'export const createClient = () => globalThis.fakeAdmin;' }));
  } }],
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k' };
globalThis.Deno = { env: { get: k => env[k] }, serve: h => { globalThis.handler = h; } };
require(out);

const LINE_ID = 'Uowner';
const lineOk = (name = 'เจ้าของ', picture = 'p.jpg') => async (url) => {
  assert.equal(String(url), 'https://api.line.me/oauth2/v2.1/verify');
  return new Response(JSON.stringify({ iss: 'https://access.line.me', aud: '2011443365', sub: LINE_ID, name, picture }), { status: 200 });
};

function setup({ profiles = [], users = {}, rpc = null, createdId = 'new-uid' } = {}) {
  const log = []; const calls = { update: [], create: [], link: 0 };
  let inflight = 0;
  const track = async (name, fn) => { log.push('start:' + name); inflight++; await new Promise(r => setTimeout(r, 5)); const res = fn(); inflight--; log.push('end:' + name); return res; };
  globalThis.fakeAdmin = {
    rpc: (_n, a) => track('rpc', () => ({ data: rpc, error: null, args: a })),
    from: () => ({
      select: () => ({ eq: (col, val) => ({ maybeSingle: () => track('profile.' + col, () => ({ data: profiles.find(p => p[col] === val) ?? null, error: null })) }) }),
      update: (patch) => ({ eq: (col, val) => ({ select: () => track('profile.update', () => { const p = profiles.find(x => x[col] === val); if (p) Object.assign(p, patch); return { data: p ? [{ id: p.id }] : [], error: null }; }) }) }),
    }),
    auth: { admin: {
      getUserById: (id) => track('getUser', () => ({ data: { user: users[id] ?? null }, error: users[id] ? null : { message: 'nf' } })),
      updateUserById: (id, patch) => track('updateUser', () => { calls.update.push([id, patch]); return { error: null }; }),
      createUser: (a) => track('createUser', () => { calls.create.push(a); const id = a.id ?? createdId; users[id] = { id, email: a.email, user_metadata: a.user_metadata, app_metadata: a.app_metadata }; return { data: { user: users[id] }, error: null }; }),
      generateLink: () => track('generateLink', () => { calls.link++; return { data: { properties: { hashed_token: 'HASH' } }, error: null }; }),
    } },
  };
  return { log, calls };
}
const login = async (fetchImpl = lineOk()) => {
  globalThis.fetch = fetchImpl;
  const res = await globalThis.handler(new Request('https://f.test/functions/v1/line-login', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ id_token: 'a.b.c' }) }));
  return { status: res.status, body: await res.json() };
};
const meta = (over = {}) => ({ provider: 'line', line_user_id: LINE_ID, line_display_name: 'เจ้าของ', line_picture: 'p.jpg', ...over });

// 1) returning user, identity unchanged: no needless Admin write, lookups overlap, profile comes back
{
  const profiles = [{ id: 'u1', role: 'superadmin', line_user_id: LINE_ID, full_name: 'เจ้าของ' }];
  const { log, calls } = setup({ profiles, rpc: 'u1', users: { u1: { id: 'u1', email: 'o@x.test', user_metadata: meta(), app_metadata: { line_user_id: LINE_ID } } } });
  const r = await login();
  assert.equal(r.status, 200); assert.equal(r.body.token_hash, 'HASH'); assert.equal(r.body.has_profile, true); assert.equal(r.body.link_state, 'already_linked');
  assert.equal(r.body.profile.role, 'superadmin'); assert.equal(r.body.profile.id, 'u1');
  assert.equal(calls.update.length, 0, 'unchanged identity is not rewritten');
  assert.ok(log.indexOf('start:profile.line_user_id') < log.indexOf('end:rpc'), 'account and profile lookups start together');
  assert.ok(log.indexOf('start:profile.id') < log.indexOf('end:generateLink'), 'link and profile read start together');
}
// 2) returning user whose LINE name or picture changed: identity is refreshed once
{
  const profiles = [{ id: 'u1', role: 'customer', line_user_id: LINE_ID }];
  const { calls } = setup({ profiles, rpc: 'u1', users: { u1: { id: 'u1', email: 'o@x.test', user_metadata: meta({ line_display_name: 'ชื่อเก่า' }), app_metadata: { line_user_id: LINE_ID } } } });
  const r = await login(lineOk('ชื่อใหม่'));
  assert.equal(r.status, 200); assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0][0], 'u1'); assert.equal(calls.update[0][1].user_metadata.line_display_name, 'ชื่อใหม่');
}
// 3) profile exists without LINE id yet: it is linked, and the returned profile already carries the id
{
  const profiles = [{ id: 'u2', role: 'merchant', line_user_id: null }];
  setup({ profiles, rpc: 'u2', users: { u2: { id: 'u2', email: 'm@x.test', user_metadata: meta(), app_metadata: { line_user_id: LINE_ID } } } });
  const r = await login();
  assert.equal(r.body.link_state, 'linked'); assert.equal(profiles[0].line_user_id, LINE_ID); assert.equal(r.body.profile.line_user_id, LINE_ID);
}
// 4) brand-new LINE user: account created, no profile yet
{
  const { calls } = setup({ profiles: [], rpc: null, createdId: 'u3' });
  const r = await login();
  assert.equal(r.status, 200); assert.equal(r.body.is_new_user, true); assert.equal(r.body.has_profile, false); assert.equal(r.body.profile, null);
  assert.equal(calls.create.length, 1); assert.equal(calls.create[0].email, `${LINE_ID}@line.invalid`);
}
// 5) profile registered through the LINE chat has no auth account: one is created with the profile's id
{
  const profiles = [{ id: 'chat-profile', role: 'driver', line_user_id: LINE_ID }];
  const { calls } = setup({ profiles, rpc: null });
  const r = await login();
  assert.equal(r.status, 200); assert.equal(calls.create[0].id, 'chat-profile'); assert.equal(r.body.profile.role, 'driver');
}
// 6) a token LINE rejects never touches the database
{
  const { log } = setup({});
  const r = await login(async () => new Response(JSON.stringify({ error: 'invalid_request', error_description: 'bad token' }), { status: 400 }));
  assert.equal(r.status, 401); assert.equal(r.body.error, 'line_verify_failed'); assert.deepEqual(log, []);
}
// 7) wrong audience is refused even if LINE says ok
{
  const { log } = setup({});
  const r = await login(async () => new Response(JSON.stringify({ iss: 'https://access.line.me', aud: 'other', sub: LINE_ID }), { status: 200 }));
  assert.equal(r.status, 401); assert.equal(r.body.error, 'bad_audience'); assert.deepEqual(log, []);
}
// 8) link mode still demands a session
{
  setup({});
  globalThis.fetch = lineOk();
  const res = await globalThis.handler(new Request('https://f.test/', { method: 'POST', body: JSON.stringify({ id_token: 'a.b.c', mode: 'link' }) }));
  assert.equal(res.status, 401); assert.equal((await res.json()).error, 'missing_session');
}
console.log('PASS line-login: unchanged identity not rewritten, lookups run together, profile returned, new/chat users created, bad tokens refused');
