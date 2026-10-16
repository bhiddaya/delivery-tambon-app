// Offline test of the owner's "view as" route: real shops/riders only (never test accounts), superadmin only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const require = createRequire(path.join(base, 'package.json'));
const out = path.join(base, 'node_modules/.cache/view-as-route.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  stdin: { contents: "export {GET} from './src/app/view-as/route';", resolveDir: base, loader: 'ts' },
  absWorkingDir: base, bundle: true, platform: 'node', format: 'cjs', outfile: out, tsconfig: path.join(base, 'tsconfig.json'),
  plugins: [{ name: 'fixtures', setup(b) {
    const names = { 'next/server': 'next-server', '@/lib/supabase/server': 'server', '@/lib/auth-guard': 'guard' };
    b.onResolve({ filter: /^(?:next\/server|@\/lib\/supabase\/server|@\/lib\/auth-guard)$/ }, a => ({ path: names[a.path], namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'js', contents: ({
      'next-server': 'export const NextResponse={redirect:(u)=>({location:String(u),cookies:{set(n,v){this.setArgs=[n,v]},delete(n){this.deleted=n}}})};',
      server: 'export const createClient=async()=>globalThis.fixtureDb;',
      guard: 'export const VIEW_AS_COOKIE="view_as";',
    })[a.path] }));
  } }],
});
const { GET } = require(out);

// a tiny in-memory stand-in for the supabase query builder (select/eq/in/is/order/limit/maybeSingle)
function db(tables, user) {
  const query = (rows) => {
    let list = rows.slice(); let desc = null; let col = null;
    const q = {
      select: () => q,
      eq: (c, v) => { list = list.filter(r => r[c] === v); return q; },
      in: (c, v) => { list = list.filter(r => v.includes(r[c])); return q; },
      is: (c, v) => { list = list.filter(r => (r[c] ?? null) === v); return q; },
      order: (c, o) => { col = c; desc = o && o.ascending === false; return q; },
      limit: (n) => { list = list.slice(0, n); return q; },
      maybeSingle: async () => ({ data: finish()[0] ?? null }),
      then: (ok, bad) => Promise.resolve({ data: finish() }).then(ok, bad),
    };
    const finish = () => { const out = list.slice(); if (col) out.sort((a, b) => (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1)); return out; };
    return q;
  };
  return { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) }, from: t => query(tables[t] ?? []) };
}
const P = (id, role, extra = {}) => ({ id, role, is_test: false, approved: true, suspended_at: null, created_at: id, ...extra });
const base0 = {
  profiles: [
    P('owner', 'superadmin'), P('customer', 'customer'),
    P('p-baidee', 'merchant'), P('p-som', 'merchant'), P('p-oy', 'merchant'),
    P('p-flag', 'merchant'), P('p-test', 'merchant', { is_test: true }), P('p-susp', 'merchant', { suspended_at: 'x' }),
    P('r-real', 'driver'), P('r-test', 'driver', { is_test: true }), P('r-susp', 'driver', { suspended_at: 'x' }),
  ],
  merchants: [
    { id: 'm-baidee', profile_id: 'p-baidee', is_test: false }, { id: 'm-som', profile_id: 'p-som', is_test: false },
    { id: 'm-oy', profile_id: 'p-oy', is_test: false }, { id: 'm-flag', profile_id: 'p-flag', is_test: true },
    { id: 'm-test', profile_id: 'p-test', is_test: false }, { id: 'm-susp', profile_id: 'p-susp', is_test: false },
  ],
  orders: [
    { merchant_id: 'm-baidee', is_test: false, created_at: '2026-10-10' },
    { merchant_id: 'm-oy', is_test: false, created_at: '2026-10-15' },
    { merchant_id: 'm-flag', is_test: false, created_at: '2026-10-16' }, // a flagged test shop must never win
    { merchant_id: 'm-som', is_test: true, created_at: '2026-10-16' },   // test orders do not count as activity
  ],
};
function call(query, { user = 'owner', cookie, tables = base0 } = {}) {
  global.fixtureDb = db(tables, user);
  const url = new URL('https://app.test/view-as' + query);
  return GET({ nextUrl: url, url: url.toString(), cookies: { get: n => (n === 'view_as' && cookie ? { value: cookie } : undefined) } });
}
const where = r => { const u = new URL(r.location); return u.pathname + u.search; };

assert.equal(where(await call('')), '/admin/people', 'exit mode');
assert.equal((await call('')).cookies.deleted, 'view_as');
assert.equal(where(await call('?demo=merchant', { user: null })), '/login', 'needs login');
assert.equal(where(await call('?demo=merchant', { user: 'customer' })), '/app', 'owner only');
assert.equal(where(await call('?demo=hack')), '/admin/people');

// first press: straight into the real shop with the latest real order (not a test shop, not test orders)
let r = await call('?demo=merchant');
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'p-oy');
// no recent orders: first real approved shop
r = await call('?demo=merchant', { tables: { ...base0, orders: [] } });
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'p-baidee');
// no real shop at all: pick from the list
assert.equal(where(await call('?demo=merchant', { tables: { ...base0, merchants: base0.merchants.filter(m => m.is_test) } })), '/admin/people');
// rider: first real approved rider
r = await call('?demo=driver');
assert.equal(where(r), '/driver'); assert.equal(r.cookies.setArgs[1], 'r-real');
assert.equal(where(await call('?demo=driver', { tables: { ...base0, profiles: base0.profiles.filter(p => p.id !== 'r-real') } })), '/admin/people?tab=riders');

// later presses: the shop/rider viewed last (valid only if same role and not a test account)
r = await call('?demo=merchant', { cookie: 'p-som' });
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'p-som');
r = await call('?demo=merchant', { cookie: 'p-test' }); assert.equal(r.cookies.setArgs[1], 'p-oy', 'test account in cookie is ignored');
r = await call('?demo=merchant', { cookie: 'r-real' }); assert.equal(r.cookies.setArgs[1], 'p-oy', 'wrong role in cookie is ignored');
r = await call('?demo=merchant', { cookie: 'gone' }); assert.equal(r.cookies.setArgs[1], 'p-oy');

// choosing a person from the list still works
r = await call('?id=p-som');
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'p-som');
console.log('PASS view-as route: real shops/riders only, picks the active real shop, remembers last viewed, owner only');
