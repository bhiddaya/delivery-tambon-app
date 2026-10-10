const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// รายชื่อร้านของ LIFF ต้องอ่านด้วยสิทธิ์ anon เสมอ ผู้ดูแลที่ล็อกอินค้างอยู่ต้องไม่เห็นร้านทดสอบปนมา — ตรวจกับโค้ดจริงใน src/app/liff/page.tsx
function load(file, sandbox) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  }).outputText, { exports, ...sandbox });
  return exports;
}

const area = (id, name, slug) => ({ id, name, slug });
const shop = (id, name, tambon_id) => ({ id, name, category: null, tambon_id });
const areas = [area('k', 'คลองกุ่ม', 'khalong-kum'), area('b', 'บุ่งไหม', 'bungmai')];
const publicShops = [shop('s1', 'ร้านจริง', 'k')];
// ผู้ดูแลระดับสูงอ่านร้านทดสอบที่เปิดอยู่ได้ด้วย (policy merchants_select_scoped) ลูกค้าและผู้เยี่ยมชมอ่านไม่ได้
const adminShops = [...publicShops, shop('s2', 'ร้านทดสอบ', 'b')];

const fakeDb = shops => ({
  from: table => {
    const result = { data: table === 'tambons' ? areas : shops, error: null };
    const c = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const m of ['select', 'eq', 'not', 'order']) c[m] = () => c;
    return c;
  },
});

const texts = n => (n == null || typeof n === 'boolean' ? [] : Array.isArray(n) ? n.flatMap(texts) : typeof n === 'object' ? texts(n.children) : [String(n)]);

async function render(searchParams = {}) {
  const used = [];
  const page = load('src/app/liff/page.tsx', {
    h: (type, props, ...children) => ({ type, props, children }),
    require: name => ({
      'next/link': { default: 'Link' },
      'lucide-react': { ChevronRight: 'ChevronRight', Store: 'Store' },
      '@/lib/supabase/server': {
        isSupabaseConfigured: () => true,
        createClient: async () => { used.push('session'); return fakeDb(adminShops); },
        createPublicClient: () => { used.push('public'); return fakeDb(publicShops); },
      },
      '@/lib/tambon-choice': { tambonDisplayName: n => `ตำบล${n}` },
    })[name],
  }).default;
  const el = await page({ searchParams: Promise.resolve(searchParams) });
  return { text: texts(el).join(' '), used };
}

test('the list never uses the visitor login session, so an admin does not see test shops', async () => {
  const r = await render();
  assert.deepEqual(r.used, ['public']);
  assert(r.text.includes('ร้านจริง'));
  assert(!r.text.includes('ร้านทดสอบ'));
  assert(!r.text.includes('ตำบลบุ่งไหม'));
});

test('a tambon with no public shop shows the empty message', async () => {
  const r = await render({ t: 'bungmai' });
  assert(r.text.includes('ยังไม่มีร้านเปิดรับออเดอร์'));
  assert(!r.text.includes('ร้านทดสอบ'));
});
