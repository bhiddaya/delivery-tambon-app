const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/lib/tambon-admin.ts
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/tambon-admin.ts', 'utf8'), {
  fileName: 'src/lib/tambon-admin.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: api });

const shop = (name, { shopTest = false, profileTest = false, owner = 'เจ้าของ' } = {}) =>
  ({ merchant: { name, is_test: shopTest }, profile: { full_name: owner, is_test: profileTest }, menuCount: 1 });

test('agents never see test shops or test riders', () => {
  const list = [shop('ร้านจริง'), shop('ร้านทดสอบ', { shopTest: true }), shop('ใจสุข', { profileTest: true }), { merchant: { name: 'ไม่มีโปรไฟล์', is_test: false }, profile: undefined, menuCount: 0 }];
  assert.deepEqual(api.realShops(list).map((m) => m.merchant.name), ['ร้านจริง', 'ไม่มีโปรไฟล์']);
  const riders = [{ profile: { full_name: 'จริง', is_test: false } }, { profile: { full_name: 'ทดสอบ', is_test: true } }];
  assert.deepEqual(api.realRiders(riders).map((d) => d.profile.full_name), ['จริง']);
});

test('owner name is dropped when it repeats the shop name', () => {
  assert.equal(api.ownerLabel('ร้านส้มตำไทยหน้าธรรมทัศน์ซอย48สันติอโศก', 'ร้านส้มตำไทยหน้าธรรมทัศน์'), null);
  assert.equal(api.ownerLabel('ใจสุข', 'ใจสุข'), null);
  assert.equal(api.ownerLabel('Baidee', 'Baidee'), null);
  assert.equal(api.ownerLabel('อ้อยผักปั่น', 'อนัญญา คมจิตร'), 'อนัญญา คมจิตร');
  assert.equal(api.ownerLabel('ร้านหนึ่ง', null), null);
  assert.equal(api.ownerLabel('ร้านหนึ่ง', '  '), null);
});

test('test accounts do not count as members waiting for approval', () => {
  const pending = shop('ร้านรอ', { profileTest: true }); pending.profile.approved = false;
  const real = shop('ร้านจริงรอ'); real.profile.approved = false;
  assert.equal(api.countWaitingApproval(api.realShops([pending, real]), []), 1);
});
