// LINE chat: choose and edit first; quote delivery only on review; QR only after confirmation.
const req = $('แยกคำสั่ง').item.json;
const r = $json || {};
const base='https://delivery-tambon-app-v3.vercel.app';
// Public LIFF ID verified from the production application's configured SDK.
const liffBase='https://liff.line.me/2011443365-RD1UinVM';
const menuUrl=id=>liffBase+'/liff/shop/'+encodeURIComponent(String(id));
const uri=(label,url)=>({type:'uri',label:cut(label,20),uri:url});
const nonce=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16)});
const partner=(label,action,extra={})=>postback(label,'food=partner&id='+encodeURIComponent(JSON.stringify({action,action_id:nonce(),...extra})));
const G = '#2e6b4a', O = '#c9731a';
const cut = (v, n) => { const s = String(v || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const txt = (text, extra = {}) => ({ type: 'text', text: String(text || '-'), wrap: true, size: 'sm', ...extra });
const postback = (label, data, display) => ({ type: 'postback', label: cut(label, 20), data, ...(/^food=(?:add|rm)(?:&|$)/.test(data) ? {} : { displayText: display || label }) });
const button = (label, data, color = G) => ({ type: 'button', style: 'primary', height: 'sm', color, action: postback(label, data) });
const quick = actions => ({ items: actions.slice(0, 13).map(action => ({ type: 'action', action })) });
const nav = (c = {}, itemId) => {
  const actions = [uri('ติ๊กเลือกอาหาร',c.merchant_id?menuUrl(c.merchant_id):liffBase+'/liff'),uri('สมัครลูกค้าใหม่',liffBase+'/liff/register'),partner('งานร้านค้า / ไรเดอร์','home')];
  if (itemId) actions.push(postback('+1 รายการนี้', 'food=add&id=' + itemId), postback('−1 รายการนี้', 'food=rm&id=' + itemId));
  if (c.merchant_id) actions.push(uri('เปิดเมนูร้าน',menuUrl(c.merchant_id)));
  actions.push(postback('เพิ่ม / ลดสินค้า', 'food=cart'), postback('สรุปยอด', 'food=review'));
  actions.push(postback('ร้าน / เมนู', 'food=shops'));
  return quick(actions);
};
const flex = (altText, contents, quickReply) => ({ type: 'flex', altText: cut(altText, 400), contents, ...(quickReply ? { quickReply } : {}) });
const box = contents => ({ type: 'box', layout: 'vertical', spacing: 'md', contents });
const bubble = (title, rows, buttons = []) => ({ type: 'bubble', body: box([txt(title, { weight: 'bold', size: 'lg' }), ...rows]), ...(buttons.length ? { footer: box(buttons) } : {}) });
const moneyRow = (label, amount, bold = false) => ({ type: 'box', layout: 'horizontal', contents: [txt(label, { flex: 4, ...(bold ? { weight: 'bold' } : {}) }), txt(baht(amount), { flex: 2, align: 'end', ...(bold ? { weight: 'bold', color: O } : {}) })] });
const picker = list => !list?.length ? [{ type: 'text', text: 'ขณะนี้ยังไม่มีพื้นที่เปิดบริการครับ' }] : [flex('เลือกพื้นที่สั่งอาหาร', { type: 'carousel', contents: list.slice(0, 10).map(t => bubble(t.name, [txt([t.district, t.province].filter(Boolean).join(' · '))], [button('เลือกพื้นที่นี้', 'food=tambon&id=' + encodeURIComponent(t.slug))])) })];
const cart = r.cart || {};
const view = r.view || req.action;
let messages = [];
if (r.handled === false) {
  // The main workflow will continue its original location handling without a reply here.
} else if (r.ok && view==='partner_reject_confirm') {
  messages=[flex('ยืนยันรับออเดอร์ไม่ได้',bubble('ออเดอร์ #'+r.order_id,[txt('ยืนยันว่าร้านรับออเดอร์นี้ไม่ได้ ระบบจะยกเลิกออเดอร์ที่ยังไม่มีสลิปหรือรับเงิน')],[{type:'button',style:'primary',color:G,action:partner('ยืนยันรับไม่ได้','reject_shop',{order_id:r.order_id})},{type:'button',style:'link',action:partner('กลับไปดูงาน','home')}]))];
} else if (r.ok && view==='finance') {
  // การเงินตำบลใน LINE: สลิปรอตรวจ (ปุ่มเดียวกับแจ้งเตือนทันที pay=ok/no) + ยอดโอนให้ร้านค้า/ไรเดอร์พร้อม QR ใส่ยอด
  const roleTh={merchant:'ร้านค้า',driver:'ไรเดอร์'};
  // การ์ดขนาดเล็ก (kilo) · QR เล็กข้างยอดเงิน แตะ QR เพื่อเปิดภาพเต็มไว้สแกน/บันทึก
  const small=b=>{b.size='kilo';b.body.contents[0].size='md';return b;};
  const slips=(r.slips||[]).map(s=>small(bubble('สลิปรอตรวจ #'+s.order_id,[moneyRow('ยอดโอนเข้า',s.total,true),txt('ดูยอดในแอปบัญชีตำบล'+(s.tambon?' · '+s.tambon:''),{size:'xs',color:'#666666'})],[button('✅ เงินเข้าแล้ว','pay=ok&o='+s.order_id),button('❌ ไม่พบยอด','pay=no&o='+s.order_id,'#777777')])));
  const payees=(r.payees||[]).map(p=>{
    const pp=String(p.promptpay_id||'').replace(/\D/g,'');
    const qr='https://promptpay.io/'+pp+'/'+Number(p.amount)+'.png';
    const info={type:'box',layout:'vertical',flex:3,spacing:'xs',contents:[txt(baht(p.amount),{weight:'bold',size:'lg',color:O}),txt('ออเดอร์ '+(p.orders||'-'),{size:'xs'}),txt(pp?'พร้อมเพย์ '+pp:'ยังไม่มีพร้อมเพย์',{size:'xs',color:pp?'#666666':O}),...(pp?[txt('แตะ QR เพื่อขยาย',{size:'xxs',color:'#999999'})]:[])]};
    const row={type:'box',layout:'horizontal',spacing:'md',contents:pp?[{type:'image',url:qr,size:'sm',aspectRatio:'1:1',flex:2,action:{type:'uri',label:'QR',uri:qr}},info]:[info]};
    return small(bubble((roleTh[p.role]||'')+' '+cut(p.name,30),[row],[{type:'button',style:'primary',height:'sm',color:O,action:partner('💸 โอนแล้ว','payout_prompt',{payee_id:p.payee_id,upto:p.upto,tambon_id:r.tambon_id})}]));
  });
  const cards=[...slips,...payees].slice(0,10);
  // แยกบัญชีทีละตำบล (อาจารย์ 12 ต.ค. 2569) · ตัวแทนหลายตำบลกดสลับได้จากปุ่มด่วน
  const q=quick([partner('อัปเดต '+String(r.title).replace('การเงิน',''),'finance',{tambon_id:r.tambon_id}),...(r.others||[]).map(t=>partner('การเงิน'+String(t.name).replace(/^ตำบล/,''),'finance',{tambon_id:t.id}))]);
  messages=cards.length?[flex(r.title+' · สลิป '+slips.length+' · โอน '+payees.length+' ราย',cards.length===1?cards[0]:{type:'carousel',contents:cards},q)]:[{type:'text',text:r.title+': ไม่มีสลิปรอตรวจ และไม่มียอดค้างโอนครับ',quickReply:q}];
  if(req.digest)messages.unshift({type:'text',text:'💸 สรุปยอดโอนวันนี้ · '+r.title+' (ตัดรอบ 21.00 น.)\nสแกน QR ด้วยแอปบัญชีตำบล โอนแล้วกด 💸 โอนแล้ว และยืนยันอีกครั้ง'});
} else if (r.ok && view==='finance_payout_confirm') {
  messages=[flex('ยืนยันโอน '+baht(r.amount),bubble('ยืนยันว่าโอนแล้ว',[txt(cut(r.name,60)+' · '+r.count+' รายการ · '+r.tambon),moneyRow('ยอดโอน',r.amount,true),txt('กดยืนยันเมื่อโอนจากบัญชีตำบลสำเร็จแล้วเท่านั้น',{color:O})],[{type:'button',style:'primary',color:G,action:partner('ยืนยัน โอนแล้ว','payout_sent',{payee_id:r.payee_id,upto:r.upto,tambon_id:r.tambon_id})},{type:'button',style:'link',action:partner('ยังไม่โอน','finance',{tambon_id:r.tambon_id})}]))];
  messages[0].contents.size='kilo';
} else if (r.ok && view==='stock') {
  // ร้านกดสลับ ของหมด / มีของ ทีละรายการ · 10 รายการต่อการ์ด
  const rows=(r.items||[]).map(i=>({type:'box',layout:'horizontal',spacing:'sm',alignItems:'center',contents:[txt((i.available?'':'✕ ')+cut(i.name,40),{flex:3,color:i.available?'#111111':'#999999'}),{type:'button',style:'primary',height:'sm',flex:2,color:i.available?'#777777':G,action:partner(i.available?'หมดแล้ว':'มีของ',i.available?'item_off':'item_on',{item_id:i.id})}]}));
  const pages=[];for(let k=0;k<rows.length;k+=10)pages.push({type:'bubble',size:'kilo',body:box([txt(r.title+(rows.length>10?' ('+(k/10+1)+')':''),{weight:'bold',size:'md'}),...rows.slice(k,k+10)])});
  const q=quick([partner('ดูงานร้าน','home')]);
  messages=pages.length?[flex('ของหมด / มีของ',pages.length===1?pages[0]:{type:'carousel',contents:pages},q)]:[{type:'text',text:'ยังไม่มีสินค้าในร้าน เพิ่มเมนูที่หน้าเว็บร้านค้าก่อนครับ',quickReply:q}];
} else if (r.ok && view==='partner_result') {
  messages=[{type:'text',text:r.text||(r.duplicate?'สถานะนี้บันทึกแล้ว':'บันทึกสถานะงานแล้ว'),quickReply:quick([/payout_/.test(req.arg||'')?partner('กลับการเงินตำบล','finance',{tambon_id:r.tambon_id}):partner('ดูงานล่าสุด','home')])}];
} else if (r.ok && view==='partner') {
  const cards=[bubble(r.title||'งานของคุณ',[txt(r.text||'ดูรายการและเลือกงานของคุณ')],Object.entries(r.links||{}).map(([label,url])=>({type:'button',style:'link',height:'sm',action:uri(label,url)})))];
  if(['merchant','driver'].includes(r.role)) cards[0].footer ||= box([]);
  if(r.role==='merchant') cards[0].footer.contents.push({type:'button',style:'primary',height:'sm',color:G,action:partner(r.shop_open?'พักรับงาน':'เปิดร้าน',r.shop_open?'close_shop':'open_shop')},{type:'button',style:'primary',height:'sm',color:O,action:partner('ของหมด / มีของ','stock')});
  if(r.role==='driver') { cards[0].body.contents.push(txt(r.online?'🟢 ออนไลน์ · รับงานใหม่ได้':'⚪ ออฟไลน์ · ไม่เห็นงานใหม่',{weight:'bold',color:r.online?G:'#777777'})); cards[0].footer.contents.push({type:'button',style:'primary',height:'sm',color:r.online?'#777777':G,action:partner(r.online?'ออฟไลน์':'ออนไลน์รับงาน',r.online?'go_offline':'go_online')}); }
  for(const j of (r.jobs||[]).slice(0,7)) {
    const rows=[txt('ออเดอร์ #'+j.id,{weight:'bold'}),txt((j.items||[]).map(i=>i.name+' × '+i.qty).join('\n')||('จุดรับ: '+(j.pickup||'-'))),txt('จุดส่ง: '+(j.dropoff||'-'))];
    if(j.note)rows.push(txt(j.note));
    const actions=[];
    if(r.role==='merchant') {
      rows.push(txt(j.customer_paid_at?'ตัวแทนยืนยันเงินแล้ว':'รอตรวจเงิน · ตรวจรายการก่อนเตรียมอาหาร'));
      if(!j.merchant_accepted_at)actions.push(partner('รับออเดอร์','accept_shop',{order_id:j.id}));
      if(j.status==='pending' && !j.customer_paid_at && !j.slip_submitted_at && !j.driver_id)actions.push(partner('รับไม่ได้','reject_shop_prompt',{order_id:j.id}));
      if(!j.food_ready_at && j.customer_paid_at)actions.push(partner('อาหารพร้อมรับ','ready',{order_id:j.id}));
    } else { actions.push(partner(j.status==='pending'?'รับงานนี้':j.status==='accepted'?'รับอาหารแล้ว':'ยืนยันส่งถึงแล้ว',j.status==='pending'?'accept_driver':j.status==='accepted'?'pickup':'deliver',{order_id:j.id})); }
    cards.push(bubble('งาน #'+j.id,rows,actions.map(action=>({type:'button',style:'primary',color:G,action}))));
  }
  for(const p of (r.payouts||[]).slice(0,Math.max(0,10-cards.length)))cards.push(bubble('เงินโอนเข้า '+baht(p.amount),[txt('เปิดแอปธนาคารตรวจเงินจริงก่อนกดยืนยัน')],[{type:'button',style:'primary',color:G,action:partner('ตรวจพบเงินเข้าแล้ว','confirm_payout',{settlement_id:p.id})}]));
  for(const c of cards){c.size='kilo';c.body.contents[0].size='md';}
  messages=[flex(r.title||'งานของคุณ',cards.length===1?cards[0]:{type:'carousel',contents:cards.slice(0,10)},quick([partner('อัปเดตงาน','home'),uri('เลือกอาหาร',base+'/liff')]))];
} else if (!r.ok && ['need_tambon', 'tambon_unavailable'].includes(r.error)) {
  messages = picker(r.tambons);
} else if (!r.ok) {
  const errors = {
    contact_agent: 'ออเดอร์มีสลิปหรือรับเงินแล้ว ให้ตัวแทนตรวจและคืนเงินก่อนยกเลิก', not_staff: 'บัญชีนี้ไม่มีสิทธิ์การเงินตำบล',
    not_approved: 'บัญชีนี้ยังไม่ได้รับอนุมัติ กรุณาติดต่อตัวแทนตำบล',
    not_your_shop: 'ออเดอร์นี้ไม่ใช่ร้านของคุณ', not_your_job: 'งานนี้ไม่ได้มอบหมายให้คุณ',
    not_driver: 'งานนี้ไม่อยู่ในตำบลหรือสิทธิ์ของคุณ', job_not_ready: 'งานยังไม่พร้อมหรือมีคนรับไปแล้ว',
    driver_offline: 'เปิดออนไลน์และเลือกยานพาหนะให้ตรงงานก่อนครับ', active_job: 'ทำงานปัจจุบันให้เสร็จก่อนรับงานใหม่',
    wrong_step: 'อัปเดตตามขั้นตอน รับอาหารก่อน แล้วจึงยืนยันส่งถึง', payment_required: 'รอตัวแทนยืนยันเงินก่อนครับ',
    closed_order: 'งานนี้ปิดแล้ว กดดูงานล่าสุดได้ครับ', account_suspended: 'บัญชีถูกพักใช้งาน ติดต่อผู้ดูแล',
    empty_cart: 'ตะกร้ายังว่าง เลือกอาหารก่อนครับ',
    shop_closed: 'ร้านปิดหรือไม่อยู่ในพื้นที่บริการ กรุณาเลือกร้านใหม่ครับ',
    item_unavailable: 'รายการนี้ไม่พร้อมขายแล้ว เลือกเมนูอื่นได้ครับ',
    intake_blocked: 'พื้นที่นี้หยุดรับออเดอร์ชั่วคราวครับ',
    shop_no_pin: 'ร้านยังไม่ได้ตั้งจุดรับสินค้า จึงยังคำนวณค่าส่งไม่ได้ครับ',
    too_far: 'จุดส่งอยู่นอกระยะบริการ 30 กม. กรุณาเปลี่ยนจุดส่งครับ',
    bad_point: 'ตำแหน่งไม่ถูกต้อง กรุณาส่งตำแหน่งจาก LINE อีกครั้งครับ',
    cart_changed: 'มีรายการไม่พร้อมขาย กรุณาปรับตะกร้าหรือล้างตะกร้าแล้วเลือกใหม่ครับ',
    review_required: 'รายการถูกแก้ไขแล้ว กด “สรุปยอด” เพื่อตรวจยอดล่าสุดครับ',
    qty_limit: 'รายการนี้ครบ 99 ชิ้นแล้วครับ',
    order_cancelled: 'ออเดอร์นี้ถูกยกเลิกแล้วครับ เลือกสินค้าเพื่อสั่งใหม่ได้',
    role_fixed_tambon: 'บัญชีร้านค้า/ไรเดอร์เปลี่ยนพื้นที่เองไม่ได้ กรุณาติดต่อผู้ดูแลครับ'
  };
  const actions = nav(cart).items.map(i => i.action);
  if (['too_far', 'bad_point'].includes(r.error)) actions.unshift({ type: 'location', label: 'ส่งจุดจัดส่ง' }, postback('เปลี่ยนจุดส่ง', 'food=location'));
  if (r.error === 'cart_changed') actions.unshift(postback('ล้างตะกร้า', 'food=clear'));
  messages = [{ type: 'text', text: errors[r.error] || 'ระบบยังทำรายการไม่ได้ กรุณาลองอีกครั้งครับ', quickReply: quick(actions) }];
} else if (view === 'need_location') {
  messages = [{ type: 'text', text: 'ส่งตำแหน่งจัดส่งครั้งนี้ เพื่อสรุปค่าอาหารและค่าส่งครับ', quickReply: quick([{ type: 'location', label: 'ส่งจุดจัดส่ง' }, ...(cart.merchant_id ? [postback('เลือกเพิ่ม', 'food=menu&id=' + cart.merchant_id)] : [])]) }];
} else if (view === 'review') {
  const q = r.quote;
  const rows = q.items.map(i => moneyRow(cut(i.name, 70) + ' ×' + i.qty, i.line_total));
  rows.push({ type: 'separator' }, moneyRow('ค่าอาหาร', q.items_total), moneyRow('ค่าจัดส่ง', q.delivery_fee), moneyRow('รวมที่ต้องชำระ', q.grand_total, true), txt('ส่งที่: ' + q.point.label, { color: '#666666', size: 'xs' }));
  rows.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูจุดส่งบนแผนที่', uri: 'https://www.google.com/maps?q=' + q.point.lat + ',' + q.point.lng } });
  if (r.notice) rows.unshift(txt(r.notice, { color: O }));
  messages = [flex('สรุปยอด ' + baht(q.grand_total) + ' รวมค่าจัดส่ง', bubble('ตรวจรายการก่อนชำระ', rows, [button('ยืนยันและชำระเงิน', 'food=confirm&id=' + q.token), button('เพิ่ม / ลดสินค้า', 'food=cart', O), button('เปลี่ยนจุดส่ง', 'food=location', '#777777')]))];
} else if (view === 'confirmed') {
  const rows = (r.items || []).map(i => moneyRow(cut(i.name, 70) + ' ×' + i.qty, i.line_total));
  rows.push({ type: 'separator' }, moneyRow('ค่าอาหาร', r.items_total), moneyRow('ค่าจัดส่ง', r.delivery_fee), moneyRow('ยอดชำระ', r.grand_total, true), txt('ส่งที่: ' + r.point.label, { size: 'xs', color: '#666666' }));
  messages = [flex('ออเดอร์ #' + r.order_id + ' · ' + baht(r.grand_total), bubble('ออเดอร์ #' + r.order_id, rows))];
  const payment = r.payment || {};
  if (payment.text) messages.push({ type: 'text', text: String(payment.text).replace(/\\n/g, '\n') });
  if (payment.qr_url) messages.push({ type: 'image', originalContentUrl: payment.qr_url, previewImageUrl: payment.qr_url });
  if (!payment.text && !payment.qr_url) messages.push({ type: 'text', text: 'ออเดอร์นี้อยู่ในขั้นตอนตรวจสอบหรือชำระเงินแล้วครับ' });
} else if (view === 'tambons') {
  messages = picker(r.tambons);
} else if (['shops', 'set_tambon'].includes(view)) {
  const shops = r.shops || [];
  messages = shops.length ? [flex('เลือกร้านอาหาร', { type: 'carousel', contents: shops.slice(0, 10).map(s => {
    const b = bubble(s.name, [txt(s.count + ' รายการ · ติ๊กเลือกและปรับจำนวนได้ทันที')], [{type:'button',style:'primary',height:'sm',color:G,action:uri('ติ๊กเลือกอาหาร',menuUrl(s.id))}]);
    if (s.photo) b.hero = { type: 'image', url: s.photo, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
    return b;
  }) }, quick([postback('เปลี่ยนพื้นที่', 'food=tambons')]))] : [{ type: 'text', text: 'ขณะนี้ยังไม่มีร้านเปิดในพื้นที่นี้ครับ', quickReply: quick([postback('เปลี่ยนพื้นที่', 'food=tambons')]) }];
} else if (view === 'menu') {
  const shopId = r.shop?.id || req.arg || cart.merchant_id;
  if (!shopId || !(r.items || []).length) messages = [{type:'text',text:'ไม่พบรายการพร้อมขายครับ',quickReply:nav(cart)}];
  else {
    const actions=[{type:'button',style:'primary',height:'sm',color:G,action:uri('เปิดเมนูติ๊กเลือก',menuUrl(shopId))}];
    if(cart.count) actions.push(button('ดูตะกร้าเดิมในแชต','food=cart',O));
    messages=[flex(r.shop?.name||'เลือกอาหาร',bubble(r.shop?.name||'เลือกอาหาร',[txt('รูปเล็ก พร้อมชื่อและราคา ติ๊กเลือกแล้วเห็นจำนวนทันที'),txt('เลือกครบแล้วกดสรุปยอดในหน้าเมนู เพื่อดูค่าอาหารและค่าขนส่ง')],actions),nav(cart))];
  }
} else if (view === 'search') {
  const items = r.items || [];
  if (!items.length) messages = [{ type: 'text', text: 'ไม่พบรายการพร้อมขายครับ', quickReply: nav(cart) }];
  else {
    const cards = items.slice(0, 11).map(i => {
      const b = bubble(i.name, [txt(baht(i.price), { color: O, weight: 'bold', size: 'lg' }), ...(i.shop_name ? [txt(i.shop_name, { size: 'xs' })] : [])], [button('+1 ใส่ตะกร้า', 'food=add&id=' + i.id), button('ดูตะกร้า', 'food=cart', O), button('สรุปยอด', 'food=review')]);
      if (i.photo) b.hero = { type: 'image', url: i.photo, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
      return b;
    });
    cards.push(bubble('เลือกได้ต่อเนื่อง', [txt('กด +1 ที่อาหาร เพิ่มหรือลดได้ในตะกร้า เลือกครบแล้วกด “สรุปยอด”'), txt('ดูรายการล่าสุดได้ในตะกร้า')], [button('เพิ่ม / ลดสินค้า', 'food=cart', O), button('สรุปยอด', 'food=review')]));
    messages = [flex(r.shop?.name || 'เมนูอาหาร', { type: 'carousel', contents: cards }, quick([...nav(cart).items.map(i => i.action), postback('เปลี่ยนพื้นที่', 'food=tambons')]))];
  }
} else if (['add', 'remove'].includes(view)) {
  // Successful edits are stored by the RPC; keep the menu on screen.
  // A shop switch must still explain why the previous cart was cleared.
  if (r.reset) messages = [{ type: 'text', text: 'เปลี่ยนร้านและล้างตะกร้าเดิมแล้ว', quickReply: nav(cart) }];
} else if (['cart', 'clear'].includes(view)) {
  if (!cart.count) messages = [{ type: 'text', text: view === 'clear' ? 'ล้างตะกร้าแล้วครับ' : 'ตะกร้ายังว่าง เลือกอาหารก่อนครับ', quickReply: nav(cart) }];
  else {
    const rows = cart.items.map(i => ({ type: 'box', layout: 'vertical', spacing: 'xs', contents: [txt(i.name + ' ×' + i.qty, { weight: 'bold' }), { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [button('−1', 'food=rm&id=' + i.id, O), button('+1', 'food=add&id=' + i.id)] }] }));
    // At most 10 editable rows per bubble; leave room for a footer and LINE payload limits.
    for (let start = 0; start < rows.length && messages.length < 4; start += 10) {
      messages.push(flex('ตะกร้า ' + cart.count + ' ชิ้น · เพิ่ม / ลดได้', bubble('ปรับตะกร้า', rows.slice(start, start + 10), [button('สรุปยอด', 'food=review'), button('เลือกเพิ่ม', 'food=menu&id=' + cart.merchant_id, O), button('ล้างตะกร้า', 'food=clear', '#777777')]), nav(cart)));
    }
  }
}
// สรุปประจำวัน push เฉพาะเมื่อมียอดค้างโอน (โควตา push จำกัด)
const push = req.digest && view === 'finance' && (r.payees || []).length ? { to: req.userId, messages: messages.slice(0, 5) } : null;
return { json: { replyToken: req.digest ? '' : req.replyToken, messages: messages.slice(0, 5), push, action: req.action, handled: r.handled !== false, result: r } };
