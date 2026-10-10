const req = $('อ่านข้อความสั่งซื้อ').item.json;
const r = $json || {};
const NL = String.fromCharCode(10);
const baht = function (n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); };
const km1 = function (n) { return (n === null || n === undefined) ? null : Number(n).toFixed(1); };
const ERR = {
  no_user: 'ขออภัยครับ ระบบไม่พบบัญชี LINE ของท่าน',
  bad_message: 'ขออภัยครับ อ่านรายการสั่งซื้อไม่ได้ ลองสั่งใหม่จากหน้าสั่งอาหารอีกครั้งนะครับ',
  bad_address: 'ที่อยู่จัดส่งสั้นเกินไปครับ กรุณาใส่บ้านเลขที่ หมู่ ซอย และจุดสังเกต แล้วสั่งใหม่อีกครั้งนะครับ',
  shop_closed: 'ร้านนี้ปิดอยู่ตอนนี้ หรือยังไม่เปิดให้ท่านสั่งครับ ลองเลือกร้านอื่นนะครับ',
  item_unavailable: 'มีสินค้าบางรายการหมดหรือเปลี่ยนแปลงแล้วครับ กรุณาเปิดหน้าสั่งอาหารแล้วเลือกใหม่อีกครั้งนะครับ',
  tambon_unavailable: 'ตำบลนี้ยังไม่เปิดให้บริการครับ',
  intake_blocked: 'ตำบลนี้หยุดรับออเดอร์ชั่วคราวครับ ขออภัยในความไม่สะดวก',
  role_fixed_tambon: 'บัญชีร้านค้า/ไรเดอร์ผูกกับตำบลเดิม เปลี่ยนตำบลเองไม่ได้ครับ ติดต่อแอดมินตำบล'
};
let messages;
if (r.ok !== true) {
  let text = ERR[r.error] || 'ขออภัยครับ ระบบรับออเดอร์ขัดข้อง ลองใหม่อีกครั้งนะครับ';
  if (r.error === 'too_far') text = 'จุดส่งอยู่ไกลจากร้านเกินไปครับ (ประมาณ ' + km1(r.distance_km) + ' กม.) กรุณาตรวจตำแหน่งแล้วสั่งใหม่อีกครั้งนะครับ';
  messages = [{ type: 'text', text: text }];
} else {
  const lines = (r.items || []).map(function (i) { return '- ' + i.name + ' x' + i.qty + ' = ' + baht(i.line_total); }).join(NL);
  const head = (r.duplicate ? 'ออเดอร์ #' + r.order_id + ' ที่ส่งมาก่อนหน้านี้ครับ (ไม่สร้างซ้ำ)' : 'รับออเดอร์ #' + r.order_id + ' แล้วครับ')
    + NL + 'ร้าน ' + r.shop_name + NL + lines + NL + 'รวมค่าสินค้า ' + baht(r.items_total);
  if (r.has_pin) {
    const pay = r.payment || {};
    const km = km1(r.distance_km);
    const body = head + NL + 'ค่าส่ง ' + baht(r.delivery_fee) + (km !== null ? ' (ระยะประมาณ ' + km + ' กม.)' : '')
      + NL + 'รวมทั้งหมด ' + baht(r.grand_total)
      + (r.no_merchant_gps ? NL + '(ร้านยังไม่ได้ปักหมุดตำแหน่ง จึงคิดค่าส่งเริ่มต้น)' : '')
      + NL + NL + (pay.qr_url ? 'ขั้นต่อไป: สแกน QR โอนเงิน แล้วส่งรูปสลิปในแชทนี้ ไรเดอร์จะออกรับของทันทีที่ตัวแทนตำบลยืนยันยอดเงินเข้าครับ' : 'ตัวแทนตำบลจะติดต่อยืนยันยอดและวิธีชำระเงินครับ');
    messages = [{ type: 'text', text: body }];
    if (pay.text) messages.push({ type: 'text', text: pay.text });
    if (pay.qr_url) messages.push({ type: 'image', originalContentUrl: pay.qr_url, previewImageUrl: pay.qr_url });
  } else {
    messages = [{ type: 'text', text: head + NL + NL + 'ขั้นต่อไป: กดปุ่ม ส่งตำแหน่งจัดส่ง ด้านล่าง ระบบจะคำนวณค่าส่งและแจ้งวิธีชำระเงินให้ครับ',
      quickReply: { items: [ { type: 'action', action: { type: 'location', label: 'ส่งตำแหน่งจัดส่ง' } } ] } }];
  }
}
return { json: { replyToken: req.replyToken, messages: messages.slice(0, 5), orderId: r.order_id || null, ok: r.ok === true } };
