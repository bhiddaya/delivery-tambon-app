const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// ชื่อร้านยาว ๆ ในหัวหน้า (เช่น "ซอย48สันติอโศก" ที่ตัดคำไม่ได้) ต้องตัดบรรทัดได้ ไม่ดันหน้ากว้างเกินจอมือถือจนเลื่อนซ้ายขวาได้
// ตรวจกับโค้ดจริงใน src/rebuilt/primitives.tsx
function load() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/rebuilt/primitives.tsx', 'utf8'), {
    fileName: 'src/rebuilt/primitives.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  }).outputText, {
    exports,
    h: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    require: name => ({
      'next/image': { default: 'Image' },
      'lucide-react': { AlertCircle: 'AlertCircle', RefreshCw: 'RefreshCw', Utensils: 'Utensils' },
    })[name],
  });
  return exports;
}

test('PageIntro title block can shrink and wrap a long unbreakable shop name', () => {
  const { PageIntro } = load();
  const row = PageIntro({ eyebrow: 'ส้มตำ', title: 'ร้านส้มตำไทยหน้าธรรมทัศน์ซอย48สันติอโศก', description: 'เลือกรายการ' });
  const titleBlock = row.children[0];
  const classes = String(titleBlock.props.className).split(' ');
  // flex item ที่ไม่มี min-w-0 หดต่ำกว่าคำที่ยาวที่สุดไม่ได้ และ break-words ให้ตัดกลางคำเมื่อจำเป็น
  assert(classes.includes('min-w-0'));
  assert(classes.includes('break-words'));
});
