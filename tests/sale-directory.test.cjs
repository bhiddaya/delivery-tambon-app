const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const calls = [], qrLinks = [];
  let result = { data: [{ name: 'ทดสอบ', slug: 'test', is_active: false }], count: 13, error: null };
  const chain = { then(resolve) { return Promise.resolve(result).then(resolve); } };
  for (const method of ['select', 'not', 'neq', 'order', 'or', 'range', 'eq', 'maybeSingle']) {
    chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
  }
  const directory = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/delivery-directory.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: directory, URLSearchParams });
  const imports = {
    'next/server': { NextResponse: { json: (data, init) => ({ data, status: init?.status ?? 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ from: table => { assert.equal(table, 'tambons'); return chain; } }) },
    qrcode: { default: { toDataURL: async link => { qrLinks.push(link); return 'data:image/png;base64,test'; } } },
    '@/lib/delivery-directory': directory,
    '@/lib/tambon-links': { tambonWebLink: slug => 'https://delivery-tambon-app-v3.vercel.app/t/' + slug },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/public/tambons/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => imports[name], process: { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public',
  } } });
  return { get: query => exports.GET({ nextUrl: { searchParams: new URLSearchParams(query) } }),
    calls, qrLinks, setResult: value => { result = value; } };
}
test('public directory paginates and includes inactive areas without private columns', async () => {
  const f = fixture(), r = await f.get('page=2&q=บุ่งไหม');
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 13);
  assert(f.calls.some(c => c[0] === 'range' && c[1] === 12 && c[2] === 23));
  assert(f.calls.some(c => c[0] === 'select' && c[1] === 'id,name,slug,district,province,is_active'));
  assert(!f.calls.some(c => c[0] === 'eq' && c[1] === 'is_active'));
});
test('QR points at the exact public tambon page, and unknown slugs fail', async () => {
  const f = fixture();
  f.setResult({ data: { name: 'ทดสอบ', slug: 'test' }, error: null });
  const r = await f.get('slug=test');
  assert.equal(r.data.link, 'https://delivery-tambon-app-v3.vercel.app/t/test');
  assert.equal(f.qrLinks[0], r.data.link);
  f.setResult({ data: null, error: null });
  assert.equal((await f.get('slug=unknown')).status, 404);
});
test('database failure returns a retryable status without internal details', async () => {
  const f = fixture();
  f.setResult({ data: null, error: Error('private database detail') });
  const r = await f.get('page=1');
  assert.equal(r.status, 503);
  assert(!JSON.stringify(r).includes('private database detail'));
});
