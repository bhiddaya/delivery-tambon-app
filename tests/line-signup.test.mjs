// Offline check of the LINE signup helpers (signature + validation). No network, no Supabase.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(base, 'package.json'));
const esbuild = require('esbuild');
const out = path.join(base, 'node_modules/.cache/line-signup.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(base, 'src/lib/line-signup.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: out,
});
const lib = require(out);

const SECRET = 'test-secret';
const UID = 'U' + 'a'.repeat(32);
const TAMBON = '00000000-0000-4000-8000-000000000001';

// ลายเซ็นต้องตรงกับที่ n8n คำนวณตอนออกลิงก์: SHA256("<secret>|<uid>|<type>")
const sig = crypto.createHash('sha256').update(`${SECRET}|${UID}|merchant`).digest('hex');
assert.equal(lib.signupSignature(UID, 'merchant', SECRET), sig);
assert.equal(lib.sameSignature(sig, sig), true);
assert.equal(lib.sameSignature(sig, 'x'), false);

const merchant = {
  type: 'merchant', uid: UID, sig, tambon_id: TAMBON, consent: true,
  shop_name: 'ร้านทดสอบ', shop_category: 'ร้านอาหาร', shop_address: 'หมู่ 1', contact_name: 'ทดสอบ', phone: '081-234-5678',
};
const ok = lib.cleanSignup(merchant);
assert.equal(ok.ok, true);
assert.equal(ok.data.referrer_first_name, null, 'ผู้แนะนำว่างได้ และเก็บเป็น null');

assert.equal(lib.cleanSignup({ ...merchant, consent: false }).ok, false, 'ต้องยินยอมก่อน');
assert.equal(lib.cleanSignup({ ...merchant, shop_name: '  ' }).ok, false, 'ชื่อร้านว่างต้องไม่ผ่าน');
assert.equal(lib.cleanSignup({ ...merchant, phone: 'abc' }).ok, false, 'เบอร์ผิดรูปต้องไม่ผ่าน');
assert.equal(lib.cleanSignup({ ...merchant, type: 'unknown' }).ok, false, 'type ที่ไม่รู้จักต้องไม่ผ่าน');

const driver = {
  type: 'drone', uid: UID, sig: 'x', tambon_id: TAMBON, consent: true,
  full_name: 'ทดสอบ ผู้ขับ', phone: '0812345678', plate: '-',
  referrer_first_name: ' สมชาย ', referrer_last_name: 'ใจดี',
};
const d = lib.cleanSignup(driver);
assert.equal(d.ok, true);
assert.equal(d.data.referrer_first_name, 'สมชาย', 'ตัดช่องว่างหัวท้าย');
assert.equal(lib.vehicleTypeOf('drone', d.data.values), 'drone');
assert.equal(lib.vehicleTypeOf('personal', { vehicle_kind: 'รถกระบะ' }), 'pickup');

console.log('line-signup: ok');
