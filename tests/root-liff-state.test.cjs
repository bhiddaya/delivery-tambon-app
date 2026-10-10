const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// LINE เปิดลิงก์ LIFF แบบมีเส้นทางเป็น "/?liff.state=<เส้นทาง>" หน้าแรกต้องพาไปเส้นทางนั้น (ตรวจกับโค้ดจริง src/app/page.tsx)
function load(file, sandbox) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URL, ...sandbox });
  return exports;
}

// คืนปลายทางที่หน้าแรก redirect ไป (redirect จริงของ Next หยุดการทำงานด้วยการโยน error จึงจำลองแบบเดียวกัน)
async function visit(searchParams, { user = null, profile = null } = {}) {
  const nextPath = load('src/lib/next-path.ts', {});
  const page = load('src/app/page.tsx', {
    require: name => ({
      'next/navigation': { redirect: to => { throw Object.assign(new Error('redirect'), { to }); } },
      '@/lib/supabase/server': {
        isSupabaseConfigured: () => true,
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user } }) },
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
        }),
      },
      '@/lib/domain': { homePathFor: role => `/${role}` },
      '@/lib/next-path': nextPath,
    })[name],
  }).default;
  try {
    await page({ searchParams: Promise.resolve(searchParams) });
  } catch (error) {
    if (error.to) return error.to;
    throw error;
  }
  return null;
}

test('LIFF link with a path goes to that path instead of the landing page', async () => {
  assert.equal(await visit({ 'liff.state': '/liff' }), '/liff');
  assert.equal(await visit({ 'liff.state': '/liff?t=khalong-kum' }), '/liff?t=khalong-kum');
  assert.equal(await visit({ 'liff.state': '/liff/shop/abc' }), '/liff/shop/abc');
});

test('a signed-in user opening a LIFF link still goes to the LIFF path', async () => {
  assert.equal(await visit({ 'liff.state': '/liff' }, { user: { id: 'u1' }, profile: { role: 'customer' } }), '/liff');
});

test('liff.state can never send people to another website', async () => {
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com', 'liff', '']) {
    assert.equal(await visit({ 'liff.state': bad }), '/delivery', JSON.stringify(bad));
  }
});

test('without liff.state the root behaves as before', async () => {
  assert.equal(await visit({}), '/delivery');
  assert.equal(await visit({}, { user: { id: 'u1' }, profile: { role: 'customer' } }), '/customer');
  assert.equal(await visit({}, { user: { id: 'u1' }, profile: null }), '/onboarding');
});
