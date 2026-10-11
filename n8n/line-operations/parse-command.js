// แยกคำสั่งสั่งอาหาร: ข้อความ / postback food=... / คำค้นจาก LINE หลัก
// พิมพ์/กด "สั่งอาหาร" → เปิดร้านในแชตตามตำบลที่จำไว้ · food=web เปิดเว็บได้ตามเดิม
const j = $input.first().json;
const text = String(j.text || '').trim();
const pb = String(j.pb || '');
const p = {};
pb.split('&').forEach(function (kv) { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
let action = '', arg = null;
if (j.action === 'location') {
  action = 'location';
  arg = JSON.stringify({ lat: j.latitude, lng: j.longitude, label: j.locationAddress || '' });
} else if (p.food) {
  // tambon = เลือกตำบล (id = slug), tambons = ขอรายชื่อตำบล (ปุ่มเปลี่ยนตำบล)
  const map = { shops: 'shops', menu: 'menu', add: 'add', rm: 'remove', cart: 'cart', clear: 'clear', checkout: 'review', review: 'review', confirm: 'confirm', location: 'request_location', tambon: 'set_tambon', tambons: 'tambons', web: 'pwa', partner: 'partner' };
  action = map[p.food] || '';
  arg = p.id || null;
} else if (j.term) { action = 'search'; arg = String(j.term); }
else if (/^(สมัครลูกค้า(?:ใหม่)?|งานร้านค้า|งานไรเดอร์|การเงินตำบล)$/.test(text)) { action='partner'; arg=JSON.stringify({action:/^สมัครลูกค้า/.test(text)?'register':text==='การเงินตำบล'?'finance':'home'}); }
else if (/^สั่งอาหาร/.test(text)) { action = 'shops'; }
if (!action || !j.userId) return [];
return [{ json: { action, arg, userId: j.userId, replyToken: j.replyToken || '', test: String(j.userId).indexOf('TEST') === 0 } }];
