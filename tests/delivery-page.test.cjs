const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ?page เกินจำนวนหน้าต้องแสดงหน้าแรก ไม่ใช่ข้อความ "โหลดไม่ได้" — ตรวจกับโค้ดจริงใน src/app/delivery/page.tsx
function load(file, sandbox) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  }).outputText, { exports, URL, URLSearchParams, ...sandbox });
  return exports;
}

// ตัวจำลอง Supabase: range() ครั้งที่ n จะได้ผลตาม rangeResult(n)
async function render(searchParams, rangeResult) {
  const ranges = [];
  const chain = () => {
    const c = { result: { data: [], count: 0, error: null } };
    for (const m of ['select', 'not', 'order', 'or', 'in', 'eq', 'limit']) c[m] = () => c;
    c.range = (from, to) => { ranges.push([from, to]); c.result = rangeResult(ranges.length - 1); return c; };
    c.then = (resolve, reject) => Promise.resolve(c.result).then(resolve, reject);
    return c;
  };
  const supabase = { from: () => chain() };
  const delivery = load('src/lib/delivery-directory.ts', {});
  const page = load('src/app/delivery/page.tsx', {
    h: (type, props) => ({ type, props }),
    require: name => ({
      '@/components/DeliveryLanding': { default: 'DeliveryLanding' },
      '@/lib/supabase/server': { createClient: async () => supabase, isSupabaseConfigured: () => true },
      '@/lib/delivery-directory': delivery,
    })[name],
  }).default;
  const el = await page({ searchParams: Promise.resolve(searchParams) });
  return { props: el.props, ranges };
}

const outOfRange = { data: null, count: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } };
const oneArea = { data: [{ id: 'a', name: 'คลองกุ่ม', slug: 'khalong-kum', district: null, province: null, is_active: true }], count: 3, error: null };

test('a page past the last one shows page 1 instead of a load error', async () => {
  const r = await render({ page: '2' }, call => (call === 0 ? outOfRange : oneArea));
  assert.deepEqual(r.ranges, [[12, 23], [0, 11]]);
  assert.equal(r.props.page, 1);
  assert.equal(r.props.unavailable, false);
  assert.equal(r.props.total, 3);
  assert.equal(r.props.areas.length, 1);
});

test('page 1 makes a single request and is not retried', async () => {
  const r = await render({}, () => oneArea);
  assert.deepEqual(r.ranges, [[0, 11]]);
  assert.equal(r.props.page, 1);
  assert.equal(r.props.unavailable, false);
});

test('a real failure still shows the unavailable message', async () => {
  const r = await render({}, () => ({ data: null, count: null, error: { code: 'XX000', message: 'boom' } }));
  assert.deepEqual(r.ranges, [[0, 11]]);
  assert.equal(r.props.unavailable, true);
});

test('if the retry of page 1 also fails, the unavailable message is shown', async () => {
  const r = await render({ page: '2' }, () => outOfRange);
  assert.deepEqual(r.ranges, [[12, 23], [0, 11]]);
  assert.equal(r.props.unavailable, true);
});
