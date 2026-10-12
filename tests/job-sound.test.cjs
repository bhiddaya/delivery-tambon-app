const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/job-sound.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS} }).outputText,{exports:api});
test('every role starts loud with fanfare + "บวรไทยมาแล้ว"; malformed persisted values are bounded',()=>{
  for(const k of ['merchant','driver','agent']){const d=api.defaultSound(k);assert.equal(d.tone,'voice');assert.equal(d.volume,100);}
  assert(api.PEAK_GAIN>=0.8&&api.PEAK_GAIN<=1);
  assert.equal(api.VOICE_TEXT,'บวรไทยมาแล้ว');
  const s=api.soundSettings({tone:'invalid',repeats:Infinity,seconds:100,gap:-4,volume:0},'driver');
  assert.equal(s.tone,'voice');assert.equal(s.repeats,3);assert.equal(s.seconds,10);assert.equal(s.gap,1);assert.equal(s.volume,10);
});
test('voice plays one fanfare then speaks once per round; fanfare repeats to fill the round',()=>{
  const v=api.soundPlan(api.soundSettings({tone:'voice',repeats:3,seconds:3,gap:2},'merchant'));
  assert.equal(v.speakAt.length,3);assert.equal(v.pulses.length,12);assert(v.pulses.every(p=>p.wave==='square'));
  assert.equal(JSON.stringify(v.speakAt.map(x=>Math.round(x*10)/10)),'[1.1,6.1,11.1]');
  const f=api.soundPlan(api.soundSettings({tone:'fanfare',repeats:2,seconds:3,gap:2},'merchant'));
  assert.equal(f.speakAt.length,0);assert.equal(f.pulses.length,2*2*4);
  assert(f.pulses.every(p=>p.at+p.duration<=Math.floor(p.at/5)*5+3));
});
test('older tones keep exactly the configured rounds and silence between rounds',()=>{
  const p=api.soundPlan(api.soundSettings({tone:'bell',repeats:4,seconds:3,gap:5},'merchant'));
  assert.equal(p.duration,27);
  for(let round=0;round<4;round++){
    const notes=p.pulses.filter(n=>n.at>=round*8&&n.at<round*8+3);
    assert.equal(notes.length,10);assert(notes.every(n=>n.at+n.duration<=round*8+3));
    assert(!p.pulses.some(n=>n.at>=round*8+3&&n.at<(round+1)*8));
  }
});
