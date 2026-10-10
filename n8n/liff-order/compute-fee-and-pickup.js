let ctx = {};
try { ctx = $('Determine Order Location Update').first().json; } catch (e) {}
let updatedOrder = {};
try {
  const rows = $('Supabase: Update Order Location').all().map(i => i.json);
  updatedOrder = rows[0] || {};
} catch (e) { updatedOrder = {}; }
let merchantRow = null;
try {
  const rows = $('Supabase: Get Merchant For Pickup').all().map(i => i.json);
  merchantRow = rows[0] || null;
} catch (e) { merchantRow = null; }

const dropoffLat = updatedOrder.dropoff_lat, dropoffLng = updatedOrder.dropoff_lng;
let pickupLat, pickupLng, pickupFromMerchant = false;
if (ctx.orderType === 'ride') {
  pickupLat = updatedOrder.pickup_lat; pickupLng = updatedOrder.pickup_lng;
} else {
  pickupLat = merchantRow ? merchantRow.lat : null;
  pickupLng = merchantRow ? merchantRow.lng : null;
  pickupFromMerchant = true;
}
const havePickup = pickupLat !== null && pickupLat !== undefined && pickupLng !== null && pickupLng !== undefined;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
// ตำบลที่ตั้งค่าค่าส่งไว้ (tambons.delivery_fee_base / delivery_fee_per_km) คิดออเดอร์อาหารตามสูตรของตำบล: ฐาน + ต่อกม. × ระยะเส้นตรง ปัดเป็นบาท
// ตำบลที่ยังไม่ตั้งค่า และงานประเภทอื่น ใช้สูตรเดิม (10 + 5/กม. ขั้นต่ำ 15) ตรงกับ delivery_fee_for ในฐานข้อมูล
const tambonCfg = merchantRow && merchantRow.tambons ? merchantRow.tambons : null;
function calcFee(km) {
  const base = tambonCfg && tambonCfg.delivery_fee_base !== null && tambonCfg.delivery_fee_base !== undefined ? Number(tambonCfg.delivery_fee_base) : null;
  if (base !== null && ctx.orderType === 'food') {
    const kmRounded = (km === null || km === undefined) ? 0 : Math.round(km * 10) / 10;
    return Math.round(base + Number(tambonCfg.delivery_fee_per_km || 0) * kmRounded);
  }
  if (km === null || km === undefined) return 15;
  return Math.max(15, Math.round(10 + km * 5));
}

const distanceKm = havePickup ? haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng) : null;
const deliveryFee = calcFee(distanceKm);

// ร้านยังไม่ปักหมุด: คิดค่าส่งขั้นต่ำ แล้วหาไรเดอร์ใกล้ลูกค้าแทน (ไม่บันทึกพิกัดลูกค้าเป็นจุดรับ)
let noMerchantGps = false;
if (!havePickup && ctx.orderType !== 'ride' && dropoffLat !== null && dropoffLat !== undefined) {
  noMerchantGps = true;
  pickupLat = dropoffLat; pickupLng = dropoffLng; pickupFromMerchant = false;
}

return [{ json: {
  havePickupFlag: (havePickup || noMerchantGps) ? 'yes' : 'no',
  noMerchantGps,
  orderId: ctx.orderId,
  orderType: ctx.orderType,
  tambonId: ctx.tambonId,
  requiredVehicleType: ctx.requiredVehicleType,
  replyToken: ctx.replyToken,
  pickupLat, pickupLng, dropoffLat, dropoffLng,
  pickupFromMerchant,
  distanceKm, deliveryFee
} }];