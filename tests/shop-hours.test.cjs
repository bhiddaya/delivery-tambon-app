const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/shop-hours.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest, Date });
const { defaultHours, validHours, openAt } = exportsForTest;
test('manual pause overrides a valid schedule and disabled scheduling preserves manual opening', () => {
  assert.equal(openAt(false, false, null, new Date()), false);
  assert.equal(openAt(true, false, null, new Date()), true);
});
test('Bangkok opening is inclusive and closing is exclusive', () => {
  const h = defaultHours();
  assert.equal(openAt(true, true, h, new Date('2026-10-11T00:59:00Z')), false);
  assert.equal(openAt(true, true, h, new Date('2026-10-11T01:00:00Z')), true);
  assert.equal(openAt(true, true, h, new Date('2026-10-11T10:00:00Z')), false);
});
test('an overnight period belongs to its starting day, even when the next day is disabled', () => {
  const h = defaultHours().map(d => ({ ...d, enabled: false })); h[0] = { enabled: true, open: '18:00', close: '02:00' };
  assert.equal(openAt(true, true, h, new Date('2026-10-11T18:59:00Z')), true);
  assert.equal(openAt(true, true, h, new Date('2026-10-11T19:00:00Z')), false);
  assert.equal(openAt(true, true, h, new Date('2026-10-12T11:00:00Z')), false);
});
test('malformed, missing days and ambiguous 24-hour periods fail closed', () => {
  for (const h of [null, [], defaultHours().slice(1), defaultHours().map(d => ({ ...d, open: '25:00' })), defaultHours().map(d => ({ ...d, close: d.open }))]) {
    assert.equal(validHours(h), false); assert.equal(openAt(true, true, h, new Date()), false);
  }
});
