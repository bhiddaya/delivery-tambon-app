// ห้องทดลอง /lab (รหัสเจ้าของ): ลองหู สมอง ปาก หลายแบบด้วยข้อความเดียวกัน แล้วเทียบคุณภาพ เวลา
// ไม่ได้ใช้ในการคุยจริง ตัวไหนดีค่อยย้ายไปใช้ในโหมดหลัก

import { createComposer, finishAnswer } from "./compose.mjs";
import { isMostlyThai, keepSpaces } from "./paxa.mjs";

// ภาษาที่ตรวจคุณภาพได้ในหน้า lab (ชื่อในภาษานั้น, ชื่อไทย)
export const LAB_LANGS = {
  en: ["English", "อังกฤษ"],
  zh: ["中文", "จีน"],
  ja: ["日本語", "ญี่ปุ่น"],
  ko: ["한국어", "เกาหลี"],
  lo: ["ລາວ", "ลาว"],
  my: ["မြန်မာ", "พม่า"],
  km: ["ខ្មែរ", "เขมร"],
  vi: ["Tiếng Việt", "เวียดนาม"],
  hi: ["हिन्दी", "ฮินดี"],
  de: ["Deutsch", "เยอรมัน"],
  fr: ["Français", "ฝรั่งเศส"],
  es: ["Español", "สเปน"],
};
// ผู้ตรวจเป็นคนละค่ายกับผู้ตอบ (Haiku) จะได้ไม่ให้คะแนนตัวเองเข้าข้าง
const JUDGE_MODEL = "google/gemini-2.5-flash";

// ความตรงของข้อความ 0-100 (ไม่นับช่องว่าง วรรคตอน ตัวพิมพ์เล็กใหญ่)
const squash = (s) => String(s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export function similarity(a, b) {
  const x = [...squash(a)];
  const y = [...squash(b)];
  if (!x.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, Math.round((1 - prev[y.length] / x.length) * 100));
}

// คำสำคัญที่ควรมีในคำตอบ (เทียบแบบไม่สนช่องว่าง)
export function countTerms(terms, text) {
  const hay = squash(text);
  const hits = terms.filter((t) => t && hay.includes(squash(t)));
  return { hit: hits.length, total: terms.length, missing: terms.filter((t) => !hits.includes(t)) };
}

// {"faithful":4,...} จากคำตอบของผู้ตรวจ (อาจมีข้อความหรือ ```json ล้อม)
export function parseJudge(text) {
  try {
    const j = JSON.parse(String(text).match(/\{[\s\S]*\}/)[0]);
    const n = (v) => Math.min(5, Math.max(1, Math.round(Number(v)) || 1));
    return { faithful: n(j.faithful), language: n(j.language), complete: n(j.complete), issues: String(j.issues || "") };
  } catch {
    return { error: "อ่านคะแนนไม่ได้", raw: String(text).slice(0, 300) };
  }
}

// คำบาลีในข้อความทดสอบ ส่งให้หูช่วยฟัง (เปิด/ปิดได้ในหน้า lab เพื่อเทียบ)
export const LAB_VOCAB = [
  "วิชชา ๘", "ปัญญา ๘", "วิมุติ", "วิมุตติญาณทัสสนะ", "วิปัสสนาญาณ", "มโนมยิทธิญาณ", "อิทธิวิธญาณ",
  "ทิพโสตญาณ", "เจโตปริยญาณ", "ปุพเพนิวาสานุสสติญาณ", "จุตูปปาตญาณ", "อาสวักขยญาณ", "อกุศล",
  "อาริยสัจจะ", "อวิชชา", "อาสวะ", "เนรมิต",
];

// สมองที่ลอง (ผ่าน OpenRouter/n8n bridge ตัวเดิม) ราคาต่อ 1 ล้าน token เข้า/ออก จาก OpenRouter 2026-11
export const LAB_BRAINS = {
  "anthropic/claude-haiku-5.5": "Haiku 5.5 ($0.10/$0.50, ใช้อยู่)",
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite ($0.10/$0.40)",
  "google/gemma-4-31b-it:free": "Gemma 4 31B (ฟรี มีโควตา ล่มบ่อย)",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra (ฟรี มีโควตา)",
};

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// pcm 16 บิต mono -> wav ให้เบราว์เซอร์เล่นด้วย <audio> ได้ทันที
export function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function ok(res, who) {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new Error(`${who} HTTP ${res.status} ${body.slice(0, 200)}`);
}

export function createLab(config, { searchTeachings, readPrompt, paxa, eleven, toThaiQuery }, fetchFn = fetch) {
  // เรียกโมเดลผ่าน n8n bridge ตัวเดิม (ใช้กับงานแปลและให้คะแนน)
  async function llm(model, content, maxTokens = 800) {
    const res = await ok(
      await fetchFn(config.llmBridgeUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-secret": config.llmBridgeSecret },
        body: JSON.stringify({ model, max_tokens: maxTokens, reasoning: { enabled: false }, messages: [{ role: "user", content }] }),
        signal: AbortSignal.timeout(90000),
      }),
      `LLM ${model}`,
    );
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error(json?.error?.message || json?.error?.description || `${model} ไม่มีคำตอบ`);
    return text.trim();
  }

  // ---------- ภาษาอื่น: ตรวจคุณภาพคำตอบหลายภาษาด้วยคำถามเดียว ----------
  // แปลคำถามไทย -> ถามระบบจริง (แปลเป็นคำค้นไทย ค้นคลัง Haiku ตอบภาษานั้น) -> แปลกลับไทย -> ผู้ตรวจให้คะแนน
  // -> นับคำสำคัญ -> (เลือกได้) ให้ ElevenLabs พูดแล้วถอดกลับ วัดว่าพูดชัดแค่ไหน
  async function multilang({ question, langs, mode, length, keyterms, voiceId }) {
    const answerOf = async (q) => {
      const t = Date.now();
      const found = await searchTeachings(await toThaiQuery(q), mode);
      const compose = createComposer(config, fetchFn);
      const raw = await compose({ systemPrompt: await readPrompt(mode), question: q, sourcesText: found.text, mode, length });
      const answer = finishAnswer(raw, found.sources);
      return { text: answer.text, cites: answer.cites, sourcesText: found.text, ms: Date.now() - t };
    };
    const thai = await answerOf(question);
    const results = await Promise.all(
      langs.map(async (code) => {
        const [native, th] = LAB_LANGS[code];
        const t0 = Date.now();
        try {
          const q = await llm(
            config.composeModel,
            `แปลคำถามต่อไปนี้เป็นภาษา${th} (${native}) ให้เป็นธรรมชาติแบบที่เจ้าของภาษาถาม คงคำบาลีไว้ ตอบเฉพาะคำแปล:\n${question}`,
            300,
          );
          const a = await answerOf(q);
          const back = await llm(
            config.composeModel,
            `แปลข้อความต่อไปนี้เป็นภาษาไทยตรงตามความหมาย ไม่เพิ่ม ไม่ตัด เขียนคำบาลีเป็นอักษรไทย ตอบเฉพาะคำแปล:\n${a.text}`,
            2500,
          );
          const judge = parseJudge(
            await llm(
              JUDGE_MODEL,
              "คุณตรวจคำตอบธรรมะที่ตอบเป็นภาษาต่างประเทศ เทียบกับต้นฉบับภาษาไทยด้านล่าง\n" +
                `${a.sourcesText}\nคำถาม (${th}): ${q}\nคำตอบ (${th}): ${a.text}\nคำแปลกลับเป็นไทย: ${back}\n\n` +
                "ให้คะแนน 1-5: faithful = ตรงกับต้นฉบับ ไม่แต่งเพิ่ม ไม่บิดความหมาย, " +
                `language = เป็นภาษา${th}ที่ถูกต้องเป็นธรรมชาติ, complete = ตอบคำถามครบ ` +
                'issues = ปัญหาที่พบ สั้น ๆ เป็นภาษาไทย ตอบ JSON เท่านั้น {"faithful":0,"language":0,"complete":0,"issues":""}',
              700,
            ),
          );
          return {
            code, native, th, question: q, answer: a.text, back, judge,
            terms: countTerms(keyterms, `${a.text} ${back}`), cites: a.cites.length, ms: Date.now() - t0,
          };
        } catch (e) {
          return { code, native, th, error: e.message, ms: Date.now() - t0 };
        }
      }),
    );
    // เสียงไปกลับทีละภาษา (ElevenLabs คิดเครดิต และทำพร้อมกันได้น้อย)
    if (voiceId && eleven) {
      for (const r of results.filter((x) => !x.error)) {
        try {
          const said = keepSpaces(r.answer).slice(0, 400);
          const heard = (await ears.eleven(pcmToWav(await eleven(said, voiceId)), null)).text;
          r.voice = { score: similarity(said, heard), heard };
        } catch (e) {
          r.voice = { error: e.message };
        }
      }
    }
    return { thai: { answer: thai.text, cites: thai.cites.length, terms: countTerms(keyterms, thai.text), ms: thai.ms }, results };
  }
  // ---------- หู: wav 16 kHz -> ข้อความ ----------
  const ears = {
    async whisper(wav, vocab) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/run/@cf/openai/whisper-large-v3-turbo`;
      const res = await ok(
        await fetchFn(url, {
          method: "POST",
          headers: { authorization: `Bearer ${config.cfApiToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            audio: wav.toString("base64"),
            language: "th",
            ...(vocab ? { initial_prompt: vocab.join(" ") } : {}),
          }),
          signal: AbortSignal.timeout(60000),
        }),
        "Whisper",
      );
      return (await res.json()).result?.text || "";
    },
    // gemini-2.5-flash ปิดรับผู้ใช้ใหม่แล้ว (404) ใช้รุ่น 3.x ถ้ารุ่นแรกคนใช้เยอะ (503) ลองรุ่นถัดไป
    async gemini(wav, vocab) {
      const ask =
        "ถอดเสียงพูดภาษาไทยในไฟล์นี้เป็นข้อความตามที่ได้ยินทุกคำ ไม่ต้องอธิบาย ไม่ต้องแก้คำ" +
        (vocab ? `\nคำที่อาจได้ยิน: ${vocab.join(", ")}` : "");
      let last;
      for (const model of ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]) {
        const res = await fetchFn(`${GEMINI}/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": config.geminiApiKey, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: ask }, { inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } }] }],
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.status === 503 || res.status === 429) {
          last = res;
          continue;
        }
        const json = await (await ok(res, `Gemini ${model}`)).json();
        return { text: (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim(), via: model };
      }
      // คีย์ Gemini ตรงของเราถูกจำกัด (503 ทุกรุ่น) ลอง Gemini ผ่าน OpenRouter (n8n bridge ตัวเดิม)
      try {
        const res = await ok(
          await fetchFn(config.llmBridgeUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-bridge-secret": config.llmBridgeSecret },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 2000,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: ask },
                    { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
                  ],
                },
              ],
            }),
            signal: AbortSignal.timeout(90000),
          }),
          "Gemini ผ่าน OpenRouter",
        );
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new Error(json.error?.message || json.error?.description || "ไม่มีข้อความ");
        return { text: text.trim(), via: "google/gemini-2.5-flash ผ่าน OpenRouter" };
      } catch (e) {
        throw new Error(`Gemini ตรงคนใช้เยอะ (503) และผ่าน OpenRouter ไม่สำเร็จ: ${e.message}`);
      }
    },
    // iApp Chinda ASR Pro v2 (ฟรีถึง 30 พ.ย. 2569 แล้ว 0.003 IC/วินาที) รับคำช่วยฟัง vocabulary ได้ 500 คำ
    async iapp(wav, vocab) {
      if (!config.iappApiKey) throw new Error("ยังไม่ได้ใส่คีย์ iApp (IAPP_API_KEY)");
      const form = new FormData();
      form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
      form.append("language_code", "th");
      form.append("speaker_labels", "false");
      for (const term of vocab || []) form.append("vocabulary", term);
      const res = await ok(
        await fetchFn("https://api.iapp.co.th/v3/store/speech/speech-to-text/pro-v2", {
          method: "POST",
          headers: { apikey: config.iappApiKey },
          body: form,
          signal: AbortSignal.timeout(120000),
        }),
        "iApp ASR",
      );
      const json = await res.json();
      return { text: (json.output || []).map((s) => s.text).join(" ").trim(), via: json.model };
    },
    // ElevenLabs Scribe v3: keyterms = คำช่วยฟัง (คิดเงินเพิ่ม 20%)
    async eleven(wav, vocab) {
      if (!config.elevenApiKey) throw new Error("ยังไม่ได้ใส่คีย์ ElevenLabs (ELEVENLABS_API_KEY)");
      const form = new FormData();
      form.append("model_id", "scribe_v3"); // ไม่ระบุภาษา: ให้ Scribe ตรวจเอง ฟังได้ 90+ ภาษา (เดิมล็อกไทย)
      form.append("tag_audio_events", "false");
      for (const term of vocab || []) form.append("keyterms", term);
      form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
      const res = await ok(
        await fetchFn("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": config.elevenApiKey },
          body: form,
          signal: AbortSignal.timeout(120000),
        }),
        "ElevenLabs STT",
      );
      return { text: ((await res.json()).text || "").trim(), via: "scribe_v3" };
    },
    async paxa(wav, vocab) {
      const form = new FormData();
      form.append("model", "paxa-stt-lite-v1-preview");
      form.append("language", "th");
      for (const term of vocab || []) form.append("vocabulary", term);
      form.append("audio", new Blob([wav], { type: "audio/wav" }), "audio.wav");
      const res = await ok(
        await fetchFn("https://api.paxalabs.com/v1/stt", {
          method: "POST",
          headers: { "x-api-key": config.paxaApiKey },
          body: form,
          signal: AbortSignal.timeout(120000),
        }),
        "Paxa STT",
      );
      const json = await res.json();
      if (typeof json.text !== "string") throw new Error(json.detail || json.title || "Paxa STT ไม่มีข้อความ");
      return json.text;
    },
  };

  // ---------- สมอง: ค้นคลังครั้งเดียว แล้วให้ทุกรุ่นตอบด้วย prompt เดียวกัน ----------
  async function brains(question, mode) {
    const found = await searchTeachings(question, mode);
    const systemPrompt = await readPrompt(mode);
    return Promise.all(
      Object.entries(LAB_BRAINS).map(async ([model, label]) => {
        const t = Date.now();
        try {
          const compose = createComposer({ ...config, composeModel: model }, fetchFn);
          const answer = finishAnswer(await compose({ systemPrompt, question, sourcesText: found.text, mode }), found.sources);
          return { model, label, ms: Date.now() - t, text: answer.text, cites: answer.cites, removed: answer.removed };
        } catch (e) {
          return { model, label, ms: Date.now() - t, error: e.message };
        }
      }),
    );
  }

  // ---------- ปาก: ข้อความ -> { type, body } ----------
  // ElevenLabs: รายชื่อเสียงในบัญชี (ให้หน้า lab เลือก)
  async function elevenVoices() {
    if (!config.elevenApiKey) throw new Error("ยังไม่ได้ใส่คีย์ ElevenLabs (ELEVENLABS_API_KEY)");
    const res = await ok(
      await fetchFn("https://api.elevenlabs.io/v2/voices?page_size=100", {
        headers: { "xi-api-key": config.elevenApiKey },
        signal: AbortSignal.timeout(30000),
      }),
      "ElevenLabs voices",
    );
    return ((await res.json()).voices || []).map((v) => ({
      id: v.voice_id,
      name: [v.name, v.labels?.gender, v.labels?.accent].filter(Boolean).join(" · "),
    }));
  }

  const mouths = {
    // ElevenLabs: voice = "voice_id|model" เช่น "abc|eleven_v4" (ภาษาไทยใช้ได้กับ eleven_v4, eleven_v4_turbo, eleven_v3)
    async eleven(text, voice) {
      if (!config.elevenApiKey) throw new Error("ยังไม่ได้ใส่คีย์ ElevenLabs (ELEVENLABS_API_KEY)");
      const [voiceId, model] = String(voice || "").split("|");
      if (!voiceId) throw new Error("ยังไม่ได้เลือกเสียง ElevenLabs");
      const res = await ok(
        await fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": config.elevenApiKey, "content-type": "application/json" },
          body: JSON.stringify({
            text: text.slice(0, 1500),
            model_id: model || "eleven_v4",
            ...(isMostlyThai(text) ? { language_code: "th" } : {}), // ภาษาอื่นให้รุ่นเลือกเอง
          }),
          signal: AbortSignal.timeout(90000),
        }),
        "ElevenLabs TTS",
      );
      return { type: "audio/mpeg", body: Buffer.from(await res.arrayBuffer()) };
    },
    // iApp Chinda TTS v3: voice = "ไก่ต้ม|style" เช่น "kaitom|calm" (0.2 IC ต่อ 1,000 ตัวอักษร)
    async iapp(text, voice) {
      if (!config.iappApiKey) throw new Error("ยังไม่ได้ใส่คีย์ iApp (IAPP_API_KEY)");
      const [name, style] = String(voice || "kaitom|neutral").split("|");
      const res = await ok(
        await fetchFn("https://api.iapp.co.th/v3/store/audio/tts", {
          method: "POST",
          headers: { apikey: config.iappApiKey, "content-type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 1200), voice: name, style: style || "neutral", format: "wav" }),
          signal: AbortSignal.timeout(90000),
        }),
        "iApp TTS",
      );
      return { type: res.headers.get("content-type") || "audio/wav", body: Buffer.from(await res.arrayBuffer()) };
    },
    async paxa(text, voice) {
      return { type: "audio/wav", body: pcmToWav(await paxa(text, voice)) };
    },
    async gemini(text, voice) {
      const res = await ok(
        await fetchFn(`${GEMINI}/gemini-3.8-flash-tts:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": config.geminiApiKey, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } } },
            },
          }),
          signal: AbortSignal.timeout(90000),
        }),
        "Gemini TTS",
      );
      const json = await res.json();
      const audio = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!audio?.data) throw new Error("Gemini TTS ไม่มีเสียง");
      const buf = Buffer.from(audio.data, "base64");
      // รุ่น 3.8 ส่ง wav มาเลย รุ่นเก่าส่ง pcm ดิบ 24 kHz
      return { type: "audio/wav", body: /wav/.test(audio.mimeType || "") ? buf : pcmToWav(buf) };
    },
  };

  return { ears, brains, mouths, elevenVoices, multilang };
}
