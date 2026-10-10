const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ตรวจกับโค้ดจริงใน src/lib/liff-send.ts (ข้อความเมื่อส่งรายการเข้าแชตผ่าน LIFF ไม่สำเร็จ)
function load() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/liff-send.ts', 'utf8'), {
    fileName: 'src/lib/liff-send.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Error, String });
  return exports;
}

test('error code is read from LINE errors and kept short', () => {
  const { errorCode } = load();
  assert.equal(errorCode({ code: 'FORBIDDEN' }), 'FORBIDDEN');
  assert.equal(errorCode({ code: 403 }), '403');
  assert.equal(errorCode({ code: 'x'.repeat(100) }).length, 40);
  assert.equal(errorCode({}), undefined);
  assert.equal(errorCode(null), undefined);
  assert.equal(errorCode('boom'), undefined);
});

test('each failure reason tells the customer what to do next', () => {
  const { LiffSendError, sendFailureText } = load();
  assert(sendFailureText(new LiffSendError('scope_unavailable')).includes('ยังไม่เปิดสิทธิ์ส่งข้อความ'));
  assert(sendFailureText(new LiffSendError('not_in_client')).includes('นอกแอป LINE'));
  const failed = sendFailureText(new LiffSendError('failed', 'FORBIDDEN'));
  assert(failed.includes('(FORBIDDEN)'));
  assert(failed.includes('ลองกดสั่งเลยอีกครั้ง'));
  assert(sendFailureText(new LiffSendError('failed')).includes('ส่งเข้าแชตไม่สำเร็จ ลองกดสั่งเลยอีกครั้ง'));
  for (const text of [new LiffSendError('scope_unavailable'), new LiffSendError('not_in_client'), new LiffSendError('failed', '1'), new Error('x'), 'x', null].map(sendFailureText)) {
    assert(text.includes('กดเปิด LINE ด้านล่างเพื่อส่งเอง'), text);
  }
});

test('the error keeps its reason and code', () => {
  const { LiffSendError } = load();
  const e = new LiffSendError('failed', '429');
  assert.equal(e.reason, 'failed');
  assert.equal(e.code, '429');
  assert.equal(e.name, 'LiffSendError');
  assert(e instanceof Error);
});
