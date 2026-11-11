const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/lib/tree-planting.ts — ลิงก์อนุมัติต้องครบและถูกรูปแบบ ไม่งั้นเป็นหน้าฟอร์มปลูก
function treeReviewParams() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/tree-planting.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URLSearchParams });
  return exports.treeReviewParams;
}

test('approve links open review mode; anything else is the planting form', () => {
  const parse = treeReviewParams();
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const ok = parse(`?approve=1&id=${id}&d=approve`);
  assert.equal(ok.id, id);
  assert.equal(ok.decision, 'approve');
  assert.equal(parse(`?approve=1&id=${id}&d=reject`).decision, 'reject');
  for (const bad of ['', `?id=${id}&d=approve`, `?approve=1&id=${id}&d=delete`, '?approve=1&id=1;drop&d=approve', `?approve=1&id=${id}`]) {
    assert.equal(parse(bad), null, bad);
  }
});
