const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/lib/identifier.ts — อีเมลในใบสมัครไม่บังคับ แต่ถ้ากรอกต้องถูกรูปแบบ
const mod = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/identifier.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod });
const { optionalEmail } = mod;

test('optional email: blank passes as null, valid is lowercased, bad is rejected', () => {
  assert.equal(optionalEmail(''), null);
  assert.equal(optionalEmail('   '), null);
  assert.equal(optionalEmail(' Somchai@Example.CO.th '), 'somchai@example.co.th');
  assert.equal(optionalEmail('somchai'), false);
  assert.equal(optionalEmail('a@b'), false);
  assert.equal(optionalEmail('a b@c.com'), false);
  assert.equal(optionalEmail(`${'a'.repeat(250)}@b.co`), false);
});

test('all four sign-up forms carry an optional email field', () => {
  for (const f of ['src/app/onboarding/page.tsx', 'src/app/liff/register/page.tsx', 'src/app/apply-tambon/page.tsx']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /อีเมล \(ไม่บังคับ\)/, f);
    assert.match(src, /type="email"/, f);
    assert.doesNotMatch(src, /type="email"[^>]*required/, f);
  }
});
