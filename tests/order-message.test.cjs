const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/rebuilt/order-message.ts (ข้อความสั่งซื้อที่ส่งเข้าแชต LINE)
function load() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/rebuilt/order-message.ts', 'utf8'), {
    fileName: 'src/rebuilt/order-message.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    require: name => ({ '@/lib/domain': { money: n => Number(n ?? 0).toLocaleString('th-TH') + ' บาท' } })[name],
  });
  return exports;
}

const item = (id, name, price) => ({ id, name, price, is_available: true, is_hidden: false, merchant_id: 'm', photo_url: null, created_at: '' });
const draft = (over = {}) => ({
  tambonName: 'ตำบลคลองกุ่ม',
  tambonSlug: 'khalong-kum',
  shopId: 'a422df01-6ade-4d0c-ad07-a68c6371e3c7',
  shopName: 'ร้านส้มตำ #1',
  lines: [{ item: item('i1', 'ส้มตำไทย', 40), quantity: 2 }, { item: item('i2', 'ไก่ย่าง #พิเศษ', 60), quantity: 1 }],
  subtotal: 140,
  address: '99/9 ซอย\nทดสอบ  ตำบลคลองกุ่ม',
  note: 'ไม่ใส่พริก #เผ็ดน้อย',
  pin: { lat: 13.7563, lng: 100.5018, accuracy: 20 },
  ...over,
});

test('liff message: readable lines for people plus one machine line for the bot', () => {
  const { buildOrderMessage } = load();
  const lines = buildOrderMessage(draft(), 'liff').split('\n');
  assert.equal(lines[0], '🛒 รายการสั่งซื้อ');
  assert(lines.includes('จุดส่ง: 99/9 ซอย ทดสอบ ตำบลคลองกุ่ม'));
  assert(lines.includes('พิกัด: 13.756300, 100.501800'));
  assert(lines.includes('https://www.google.com/maps/search/?api=1&query=13.756300,100.501800'));
  assert.equal(lines.at(-1), '[order:v1 shop=a422df01-6ade-4d0c-ad07-a68c6371e3c7 area=khalong-kum items=i1x2,i2x1 lat=13.756300 lng=100.501800]');
});

test('liff message never contains # (the bot reads #slug as a set-tambon command)', () => {
  const { buildOrderMessage } = load();
  assert(!buildOrderMessage(draft(), 'liff').includes('#'));
});

test('liff message without a GPS pin leaves out coordinates and keeps the order code', () => {
  const { buildOrderMessage } = load();
  const text = buildOrderMessage(draft({ pin: null }), 'liff');
  assert(!text.includes('พิกัด'));
  assert(!/lat=|lng=/.test(text));
  assert(text.endsWith('items=i1x2,i2x1]'));
});

test('web message keeps the old layout and adds coordinates only when a pin exists', () => {
  const { buildOrderMessage } = load();
  const withPin = buildOrderMessage(draft(), 'web').split('\n');
  assert.equal(withPin[0], 'ตำบลคลองกุ่ม #khalong-kum');
  assert.equal(withPin[1], 'ขอสั่งจากร้าน ร้านส้มตำ #1');
  assert(withPin.includes('พิกัด: 13.756300, 100.501800'));
  assert.equal(withPin.at(-1), 'กรุณายืนยันร้านพร้อมรับ ค่าส่ง ยอดรวม และวิธีชำระก่อนสร้างออเดอร์');
  assert(!buildOrderMessage(draft({ pin: null }), 'web').includes('พิกัด'));
});
