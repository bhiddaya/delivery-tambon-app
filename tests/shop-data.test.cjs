const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/rebuilt/shop-data.ts
function load() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/rebuilt/shop-data.ts', 'utf8'), {
    fileName: 'src/rebuilt/shop-data.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  return exports.loadShopPage;
}

// ตัวจำลอง Supabase: จดว่าแต่ละตารางถูกขอคอลัมน์อะไรและกรองด้วยอะไร
function fakeDb({ merchant = null, merchantError = null, menu = [], area = null }) {
  const calls = [];
  const db = {
    from(table) {
      const c = { table, cols: null, eqs: [] };
      c.select = cols => { c.cols = cols; return c; };
      c.eq = (key, value) => { c.eqs.push([key, value]); return c; };
      c.order = () => c;
      c.maybeSingle = async () => (table === 'merchants' ? { data: merchant, error: merchantError } : { data: area, error: null });
      c.then = (resolve, reject) => Promise.resolve({ data: menu, error: null }).then(resolve, reject);
      calls.push(c);
      return c;
    },
  };
  return { db, calls };
}

const publicMerchant = { id: 'm1', name: 'ร้านทดสอบ', category: 'อาหาร', tambon_id: 't1', is_open: true };
const signedInMerchant = { ...publicMerchant, address: 'ซอย 1' };
const publicArea = { id: 't1', name: 'คลองกุ่ม', slug: 'khalong-kum', is_active: true, delivery_fee_base: 35, delivery_fee_per_km: 10 };

test('public page asks only for columns that anonymous visitors may read', async () => {
  const { db, calls } = fakeDb({ merchant: publicMerchant, menu: [{ id: 'i1' }], area: publicArea });
  const page = await load()(db, 'm1', null);
  const merchants = calls.find(c => c.table === 'merchants');
  const tambons = calls.find(c => c.table === 'tambons');
  assert.equal(merchants.cols, 'id,name,category,tambon_id,is_open');
  assert.deepEqual(merchants.eqs, [['id', 'm1']]);
  assert.equal(tambons.cols, 'id,name,slug,is_active,delivery_fee_base,delivery_fee_per_km');
  assert.deepEqual(calls.find(c => c.table === 'menu_items').eqs, [['merchant_id', 'm1'], ['is_hidden', false]]);
  assert.equal(page.shop.address, null);
  assert.equal(page.area.intake_blocked, false);
  assert.equal(page.menu.length, 1);
});

test('signed-in customer keeps the area and test-account scoping', async () => {
  const { db, calls } = fakeDb({ merchant: signedInMerchant, area: { ...publicArea, intake_blocked: true } });
  const page = await load()(db, 'm1', { tambonId: 't1', isTest: false });
  const merchants = calls.find(c => c.table === 'merchants');
  assert.equal(merchants.cols, '*');
  assert.deepEqual(merchants.eqs, [['id', 'm1'], ['tambon_id', 't1'], ['is_test', false]]);
  assert.match(calls.find(c => c.table === 'tambons').cols, /intake_blocked/);
  assert.equal(page.shop.address, 'ซอย 1');
  assert.equal(page.area.intake_blocked, true);
});

test('a signed-in customer without a tambon matches no shop', async () => {
  const { db, calls } = fakeDb({ merchant: null });
  await load()(db, 'm1', { tambonId: null, isTest: false });
  assert.deepEqual(calls.find(c => c.table === 'merchants').eqs[1], ['tambon_id', '00000000-0000-0000-0000-000000000000']);
});

test('an unknown or hidden shop returns no shop and does not query the menu', async () => {
  const { db, calls } = fakeDb({ merchant: null });
  const page = await load()(db, 'missing', null);
  assert.equal(page.shop, null);
  assert.equal(page.area, null);
  assert.equal(page.menu.length, 0);
  assert.equal(calls.length, 1);
});

test('a database error is thrown, not shown as an empty shop', async () => {
  const { db } = fakeDb({ merchantError: { message: 'boom' } });
  await assert.rejects(load()(db, 'm1', null), /shop unavailable/);
});
