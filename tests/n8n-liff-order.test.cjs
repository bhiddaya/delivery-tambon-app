const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// โค้ดของ Code node ใน n8n workflow "รับออเดอร์จาก LIFF (order:v1)" เก็บสำเนาไว้ใน n8n/liff-order/ ตรวจกับไฟล์จริง
const NL = String.fromCharCode(10);
const read = name => fs.readFileSync(`n8n/liff-order/${name}`, 'utf8');
const run = (code, ctx) => new Function('$input', '$json', '$', code)(ctx.input, ctx.json, ctx.ref);

const LINE_TEXT = [
  '🛒 รายการสั่งซื้อ',
  'ร้าน: ร้านทดสอบ',
  'จุดส่ง: 99/9 ซอยทดสอบ',
  '[order:v1 shop=a422df01-6ade-4d0c-ad07-a68c6371e3c7 area=khalong-kum items=518a44ee-251a-41b8-b0f9-273b57eed54cx1 lat=13.800000 lng=100.600000]',
].join(NL);

const readMessage = event => run(read('read-message.js'), { input: { first: () => ({ json: event }) } });

test('read-message passes on an order:v1 message with the user and the reply token', () => {
  const out = readMessage({ userId: 'Uabc', text: LINE_TEXT, replyToken: 'tok' });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.userId, 'Uabc');
  assert.equal(out[0].json.text, LINE_TEXT);
  assert.equal(out[0].json.replyToken, 'tok');
  assert.equal(out[0].json.test, false);
});

test('read-message ignores other text, a missing user, and an unclosed code', () => {
  assert.deepEqual(readMessage({ userId: 'Uabc', text: 'สั่งอาหาร', replyToken: 't' }), []);
  assert.deepEqual(readMessage({ text: LINE_TEXT, replyToken: 't' }), []);
  assert.deepEqual(readMessage({ userId: 'Uabc', text: '[order:v1 shop=x items=y', replyToken: 't' }), []);
});

test('read-message marks TEST users so no real reply is attempted', () => {
  const out = readMessage({ userId: 'TEST-1', text: LINE_TEXT });
  assert.equal(out[0].json.test, true);
  assert.equal(out[0].json.replyToken, '');
});

const build = result => run(read('build-reply.js'), {
  json: result,
  ref: () => ({ item: { json: { userId: 'Uabc', replyToken: 'tok' } } }),
}).json;

const item = (name, qty, price) => ({ id: name, name, qty, price, line_total: qty * price });
const paid = { text: '💳 ชำระเงินออเดอร์ #137 ยอด 210 บาท', qr_url: 'https://promptpay.io/x/210.00.png', total: 210 };
const withPin = (over = {}) => ({
  ok: true, duplicate: false, order_id: 137, shop_name: 'ร้านส้มตำ', items: [item('ข้าวยำ', 1, 40), item('ส้มตำ', 2, 40)],
  items_total: 120, has_pin: true, distance_km: 5.5, delivery_fee: 90, grand_total: 210, no_merchant_gps: false, payment: paid, ...over,
});

test('order with a pin tells the fee, the total and sends the payment text and QR in one reply', () => {
  const out = build(withPin());
  assert.equal(out.replyToken, 'tok');
  assert.equal(out.messages.length, 3);
  const [summary, pay, qr] = out.messages;
  assert(summary.text.includes('รับออเดอร์ #137 แล้วครับ'));
  assert(summary.text.includes('- ข้าวยำ x1 = ฿40'));
  assert(summary.text.includes('รวมค่าสินค้า ฿120'));
  assert(summary.text.includes('ค่าส่ง ฿90 (ระยะประมาณ 5.5 กม.)'));
  assert(summary.text.includes('รวมทั้งหมด ฿210'));
  assert(summary.text.includes('สแกน QR โอนเงิน'));
  assert.equal(pay.text, paid.text);
  assert.equal(qr.type, 'image');
  assert.equal(qr.originalContentUrl, paid.qr_url);
  assert.equal(out.orderId, 137);
  assert.equal(out.ok, true);
});

test('without a QR the reply says the agent will confirm and sends no image', () => {
  const out = build(withPin({ payment: { text: 'ชำระเงินตามที่ตัวแทนตำบลแจ้งครับ', qr_url: null } }));
  assert.equal(out.messages.length, 2);
  assert(out.messages[0].text.includes('ตัวแทนตำบลจะติดต่อยืนยันยอด'));
  assert(!out.messages.some(m => m.type === 'image'));
});

test('a shop without a map pin gets the minimum-fee note', () => {
  const out = build(withPin({ no_merchant_gps: true, distance_km: null }));
  assert(out.messages[0].text.includes('ร้านยังไม่ได้ปักหมุด'));
  assert(!out.messages[0].text.includes('ระยะประมาณ'));
});

test('order without a pin asks for the location with a location quick reply and no payment yet', () => {
  const out = build({ ok: true, duplicate: false, order_id: 138, shop_name: 'ร้านส้มตำ', items: [item('ข้าวยำ', 1, 40)], items_total: 40, has_pin: false, delivery_fee: null, grand_total: 40, payment: null });
  assert.equal(out.messages.length, 1);
  const m = out.messages[0];
  assert(m.text.includes('รับออเดอร์ #138'));
  assert(m.text.includes('ส่งตำแหน่งจัดส่ง'));
  assert.equal(m.quickReply.items[0].action.type, 'location');
  assert(!m.text.includes('ค่าส่ง ฿'));
});

test('a repeated message says the order already exists', () => {
  const out = build(withPin({ duplicate: true }));
  assert(out.messages[0].text.includes('ออเดอร์ #137 ที่ส่งมาก่อนหน้านี้'));
  assert(!out.messages[0].text.includes('รับออเดอร์ #137 แล้วครับ'));
});

test('every database error becomes a plain Thai message and never an order', () => {
  for (const error of ['no_user', 'bad_message', 'bad_address', 'shop_closed', 'item_unavailable', 'tambon_unavailable', 'intake_blocked', 'role_fixed_tambon']) {
    const out = build({ ok: false, error });
    assert.equal(out.ok, false, error);
    assert.equal(out.messages.length, 1, error);
    assert(!out.messages[0].text.includes('ขัดข้อง'), error);
  }
  assert(build({ ok: false, error: 'too_far', distance_km: 479.3 }).messages[0].text.includes('479.3 กม.'));
});

test('an unknown error or a failed database call gets the generic apology', () => {
  assert(build({ ok: false, error: 'something_new' }).messages[0].text.includes('ขัดข้อง'));
  assert(build({}).messages[0].text.includes('ขัดข้อง'));
  assert(build({ error: { message: 'HTTP 500' } }).messages[0].text.includes('ขัดข้อง'));
});
