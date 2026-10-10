const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Code node "Compute Fee And Pickup" ในบอทหลัก (n8n) หลังปรับให้ใช้สูตรค่าส่งของตำบล เก็บสำเนาไว้ที่ n8n/liff-order/
const patched = fs.readFileSync('n8n/liff-order/compute-fee-and-pickup.js', 'utf8');

// ตัวจำลอง $('ชื่อโหนด') ของ n8n: ctx = Determine Order Location Update, updatedOrder = Update Order Location, merchantRow = Get Merchant For Pickup
function run({ orderType = 'food', merchant, dropoff = { lat: 13.8, lng: 100.6 } }) {
  const nodes = {
    'Determine Order Location Update': { first: () => ({ json: { orderId: 7, orderType, tambonId: 't1', requiredVehicleType: null, replyToken: 'tok' } }) },
    'Supabase: Update Order Location': { all: () => [{ json: { dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, pickup_lat: null, pickup_lng: null } }] },
    'Supabase: Get Merchant For Pickup': { all: () => (merchant ? [{ json: merchant }] : []) },
  };
  const out = new Function('$', patched)(name => nodes[name]);
  return out[0].json;
}

// ร้านห่างจากจุดส่งราว 5.5 กม. (ละติจูดต่างกัน 0.05 องศา ≈ 5.56 กม.)
const SHOP = { lat: 13.75, lng: 100.6 };
const khalongKum = { ...SHOP, tambons: { delivery_fee_base: 35, delivery_fee_per_km: 10 } };
const bungmai = { ...SHOP, tambons: { delivery_fee_base: null, delivery_fee_per_km: null } };

test('food order in a tambon with a fee formula uses base + per km x distance (rounded to 0.1 km, then to baht)', () => {
  const r = run({ merchant: khalongKum });
  assert.equal(r.deliveryFee, 35 + 10 * Math.round(r.distanceKm * 10) / 10);
  assert(r.deliveryFee > 85 && r.deliveryFee < 95, String(r.deliveryFee));
  assert.equal(r.havePickupFlag, 'yes');
});

test('a tambon without a formula keeps the old fee exactly (10 + 5 per km, minimum 15)', () => {
  const r = run({ merchant: bungmai });
  assert.equal(r.deliveryFee, Math.max(15, Math.round(10 + r.distanceKm * 5)));
  const noTambon = run({ merchant: SHOP });
  assert.equal(noTambon.deliveryFee, Math.max(15, Math.round(10 + noTambon.distanceKm * 5)));
});

test('only food orders use the tambon formula, other order types keep the old fee', () => {
  const r = run({ orderType: 'agri_service', merchant: khalongKum });
  assert.equal(r.deliveryFee, Math.max(15, Math.round(10 + r.distanceKm * 5)));
});

test('a shop without a map pin: formula tambon charges the base fee, others the minimum 15 as before', () => {
  const kk = run({ merchant: { lat: null, lng: null, tambons: khalongKum.tambons } });
  assert.equal(kk.deliveryFee, 35);
  assert.equal(kk.noMerchantGps, true);
  assert.equal(kk.pickupLat, 13.8);
  const other = run({ merchant: { lat: null, lng: null, tambons: bungmai.tambons } });
  assert.equal(other.deliveryFee, 15);
});

test('no merchant row at all keeps the old behaviour', () => {
  const r = run({ merchant: null });
  assert.equal(r.deliveryFee, 15);
  assert.equal(r.noMerchantGps, true);
});

test('the same distance gives the same fee as the database function delivery_fee_for', () => {
  // delivery_fee_for(คลองกุ่ม, 5.5) = round(35 + 10 x 5.5) = 90 (ตรวจกับฐานข้อมูลจริง 11 ต.ค. 2569)
  const r = run({ merchant: khalongKum, dropoff: { lat: 13.75 + 0.0495, lng: 100.6 } });
  assert.equal(Math.round(r.distanceKm * 10) / 10, 5.5);
  assert.equal(r.deliveryFee, 90);
});
