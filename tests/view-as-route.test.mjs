// Offline test of the owner's "view as" route: real shops/riders only, never test accounts, superadmin only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(base, 'package.json'));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const out = path.join(base, 'node_modules/.cache/view-as-route.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  stdin: { contents: "export {GET} from './src/app/view-as/route';", resolveDir: base, loader: 'ts' },
  absWorkingDir: base, bundle: true, platform: 'node', format: 'cjs', outfile: out, tsconfig: path.join(base, 'tsconfig.json'), external: [],
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

const profiles = {
  owner: { role: 'superadmin' },
  customer: { role: 'customer' },
  shop: { id: 'shop', role: 'merchant', is_test: false },
  testshop: { id: 'testshop', role: 'merchant', is_test: true },
  rider: { id: 'rider', role: 'driver', is_test: false },
};
function call(query, { user = 'owner', cookie } = {}) {
  global.fixtureDb = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: () => ({ select: () => ({ eq: (_col, val) => ({ maybeSingle: async () => ({ data: profiles[val] ?? null }) }) }) }),
  };
  const url = new URL('https://app.test/view-as' + query);
  return GET({ nextUrl: url, url: url.toString(), cookies: { get: n => (n === 'view_as' && cookie ? { value: cookie } : undefined) } });
}
const where = r => new URL(r.location).pathname + new URL(r.location).search;

assert.equal(where(await call('', {})), '/admin/people', 'exit mode');
assert.equal((await call('', {})).cookies.deleted, 'view_as');
assert.equal(where(await call('?demo=merchant', { user: null })), '/login', 'needs login');
assert.equal(where(await call('?demo=merchant', { user: 'customer' })), '/app', 'owner only');

// first press: nothing remembered → pick a real person from the list
let r = await call('?demo=merchant');
assert.equal(where(r), '/admin/people'); assert.equal(r.cookies.setArgs, undefined);
assert.equal(where(await call('?demo=driver')), '/admin/people?tab=riders');
assert.equal(where(await call('?demo=hack')), '/admin/people');

// later presses: reopen the real shop/rider viewed last
r = await call('?demo=merchant', { cookie: 'shop' });
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'shop');
r = await call('?demo=driver', { cookie: 'rider' });
assert.equal(where(r), '/driver'); assert.equal(r.cookies.setArgs[1], 'rider');

// never a test account, never the wrong role
assert.equal(where(await call('?demo=merchant', { cookie: 'testshop' })), '/admin/people');
assert.equal(where(await call('?demo=merchant', { cookie: 'rider' })), '/admin/people');
assert.equal(where(await call('?demo=driver', { cookie: 'shop' })), '/admin/people?tab=riders');
assert.equal(where(await call('?demo=merchant', { cookie: 'gone' })), '/admin/people');

// picking a person from the list still works
r = await call('?id=shop');
assert.equal(where(r), '/merchant/orders'); assert.equal(r.cookies.setArgs[1], 'shop');
console.log('PASS view-as route: real shops/riders only, remembers last viewed, owner only');
