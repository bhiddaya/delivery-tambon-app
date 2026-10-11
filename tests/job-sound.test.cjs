const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/job-sound.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS} }).outputText,{exports:api});
test('merchant and driver default to different tones; malformed persisted values are bounded',()=>{
  assert.notEqual(api.defaultSound('merchant').tone,api.defaultSound('driver').tone);
  const s=api.soundSettings({tone:'invalid',repeats:Infinity,seconds:100,gap:-4,volume:0},'driver');
  assert.equal(s.tone,'pulse');assert.equal(s.repeats,3);assert.equal(s.seconds,10);assert.equal(s.gap,1);assert.equal(s.volume,10);
});
test('sound plan has exactly the configured rounds and silence between rounds',()=>{
  const p=api.soundPlan(api.soundSettings({tone:'bell',repeats:4,seconds:3,gap:5},'merchant'));
  assert.equal(p.duration,27);
  for(let round=0;round<4;round++){
    const notes=p.pulses.filter(n=>n.at>=round*8&&n.at<round*8+3);
    assert.equal(notes.length,10);assert(notes.every(n=>n.at+n.duration<=round*8+3));
    assert(!p.pulses.some(n=>n.at>=round*8+3&&n.at<(round+1)*8));
  }
});
