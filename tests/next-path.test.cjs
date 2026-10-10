const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/lib/next-path.ts — ?next= ห้ามส่งต่อไปเว็บอื่น
function safeNextPath() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/next-path.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URL });
  return exports.safeNextPath;
}

test('next= keeps in-app paths and rejects anything that leaves the site', () => {
  const safe = safeNextPath();
  assert.equal(safe('/customer/merchants/abc?x=1#m'), '/customer/merchants/abc?x=1#m');
  assert.equal(safe('/'), '/');
  assert.equal(safe(null), null);
  assert.equal(safe(''), null);
  assert.equal(safe('evil.com'), null);
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\\[']) {
    assert.equal(safe(bad), null, JSON.stringify(bad));
  }
});
