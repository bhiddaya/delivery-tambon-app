// n8n workflow DRujoPqgXs4e7E72 "บวรไทย LINE – ตอบพร้อมเสียง (ตัวช่วย)" (n8n Workflow SDK source).
// ตัวช่วยกลาง: บริการส่ง {replyToken, messages, voice, lang?, speakText?, spoken?} มา
// ผู้ใช้พูดมา (voice === true) → ขอเสียงจาก Hermes /tts แล้วใส่ audio ไว้หน้าข้อความ
// ทุกทางที่ล้ม (login, /tts, ช้าเกิน) → ตอบข้อความเดิม บอทไม่เงียบ
// Spec: docs/superpowers/specs/2026-11-19-line-voice-reply-design.md
import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

const start = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: { name: 'เริ่ม (จากบริการ)', parameters: { inputSource: 'passthrough' } }
});

const prepare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'เตรียมเสียง',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `// ใส่เสียงเฉพาะเมื่อพูดมา มีที่ว่างใน reply (LINE รับไม่เกิน 5 ข้อความ) และมีคำให้พูด
// คำให้พูด = speakText ที่บริการส่งมา หรือ text / altText (flex) ของทุกข้อความ
const i = $input.first().json;
const messages = Array.isArray(i.messages) ? i.messages.slice(0, 5) : [];
const say = String(i.speakText || messages.map(m => m && m.type === 'text' ? m.text : (m && m.altText) || '').filter(Boolean).join(' ')).trim();
const want = i.voice === true && messages.length > 0 && messages.length < 5 && say.length > 0;
return [{ json: { replyToken: String(i.replyToken || ''), messages, want,
  tts: { text: say.slice(0, 2000), lang: String(i.lang || 'th'), spoken: i.spoken !== false } } }];`
    }
  }
});

const spoke = ifElse({
  version: 2.2,
  config: {
    name: 'พูดมา?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.want }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const login = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Login Hermes',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://hermes-router.onrender.com/auth/login?refresh_token=false',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      options: { timeout: 2000 }
    },
    credentials: { httpCustomAuth: newCredential('Hermes bot login', '2n0MfzWuxgUw15zU') }
  }
});

const speak = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'ขอเสียง (Hermes /tts)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://hermes-router.onrender.com/tts',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $json.access_token }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($(\'เตรียมเสียง\').first().json.tts) }}'),
      options: { timeout: 6000, response: { response: { fullResponse: true, neverError: true } } }
    }
  }
});

const addVoice = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'ใส่เสียงหน้าข้อความ',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `// ได้ไฟล์เสียง → audio เป็นข้อความแรก · ไม่ได้ (login ล้ม, 4xx/5xx, หมดเวลา) → ข้อความเดิม
const base = $('เตรียมเสียง').first().json;
const r = $input.first().json || {};
const b = r.body || {};
const ok = r.statusCode === 200 && typeof b.url === 'string' && b.url.startsWith('https://') && Number(b.duration_ms) > 0;
const messages = ok
  ? [{ type: 'audio', originalContentUrl: b.url, duration: Math.round(Number(b.duration_ms)) }].concat(base.messages).slice(0, 5)
  : base.messages;
return [{ json: { replyToken: base.replyToken, messages, voiced: ok, ttsStatus: r.statusCode || null } }];`
    }
  }
});

const reply = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'ตอบ LINE',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.line.me/v2/bot/message/reply',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ replyToken: $json.replyToken, messages: $json.messages }) }}'),
      options: { timeout: 10000 }
    },
    credentials: { httpHeaderAuth: newCredential('LINE OA บวรไทย', 'iHzBgLbvsEddIxq2') }
  }
});

export default workflow('reply-with-voice', 'บวรไทย LINE – ตอบพร้อมเสียง (ตัวช่วย)')
  .add(start)
  .to(prepare)
  .to(spoke
    .onTrue(login.to(speak.to(addVoice.to(reply))))
    .onFalse(reply));
