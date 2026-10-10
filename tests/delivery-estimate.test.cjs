const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/rebuilt/delivery-estimate.ts (ค่าส่งประมาณที่หน้าสั่งอาหารเรียกจากฐานข้อมูล)
function load() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/rebuilt/delivery-estimate.ts', 'utf8'), {
    fileName: 'src/rebuilt/delivery-estimate.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Number, Array });
  return exports;
}

const pin = { lat: 13.75, lng: 100.5, accuracy: 10 };
const db = (data, error = null) => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } };
};

test('estimate asks the database with the shop and the pin and returns fee and distance', async () => {
  const { loadDeliveryEstimate } = load();
  const client = db({ ok: true, fee: 90, distance_km: 5.5, basis: 'straight_line' });
  const result = await loadDeliveryEstimate(client, 'shop-1', pin);
  assert.equal(result.fee, 90);
  assert.equal(result.km, 5.5);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0][0], 'estimate_delivery_fee');
  assert.equal(client.calls[0][1].p_shop_id, 'shop-1');
  assert.equal(client.calls[0][1].p_lat, 13.75);
  assert.equal(client.calls[0][1].p_lng, 100.5);
});

test('a shop without a pin gives the base fee and no distance', async () => {
  const { loadDeliveryEstimate } = load();
  const result = await loadDeliveryEstimate(db({ ok: true, fee: 35, distance_km: null, basis: 'base_only' }), 'shop-1', pin);
  assert.equal(result.fee, 35);
  assert.equal(result.km, null);
});

test('anything the database cannot answer becomes null so the page falls back to the tambon formula', async () => {
  const { loadDeliveryEstimate } = load();
  for (const bad of [
    db({ ok: false, error: 'shop_unavailable' }),
    db(null),
    db([]),
    db('x'),
    db({ ok: true, fee: null }),
    db({ ok: true, fee: 'abc' }),
    db(null, { message: 'boom' }),
  ]) {
    assert.equal(await loadDeliveryEstimate(bad, 'shop-1', pin), null);
  }
});

test('the key changes when the pin or the shop changes', () => {
  const { estimateKey } = load();
  assert.equal(estimateKey('a', pin), estimateKey('a', { ...pin, accuracy: 99 }));
  assert.notEqual(estimateKey('a', pin), estimateKey('b', pin));
  assert.notEqual(estimateKey('a', pin), estimateKey('a', { ...pin, lat: 13.76 }));
});
