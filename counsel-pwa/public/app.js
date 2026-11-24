// หน้า PWA: ส่งเสียงไมค์ขึ้นเซิร์ฟเวอร์ และเล่นเสียงตอบกลับ 24kHz
// ใช้ ScriptProcessor เพื่อให้เรียบง่ายในขั้นแรก ควรย้ายไป AudioWorklet ภายหลัง

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const statusEl = $("status");
const talkEl = $("talk");
const startBtns = [...document.querySelectorAll("button.start")];
const stopBtn = $("stop");
const MODE_TH = { counsel: "ปรึกษาปัญหาชีวิต", dhamma: "ถามธรรมะ", nova: "NOVA" };
const tokenIn = $("token");
const voiceSel = $("voice");
const textIn = $("text");
const orbEl = $("orb");

// หน้า /nova: หน้าเดียวกันแต่แสดงแบบ NOVA ใช้รหัสเจ้าของ (เก็บแยกจากรหัสเชิญ) เสียงเริ่มต้น Charon เหมือน NOVA บนเครื่อง
const IS_NOVA = location.pathname.replace(/\/$/, "") === "/nova";
const KEYS = IS_NOVA
  ? { token: "ownerToken", voice: "novaVoice", ear: "novaEar", length: "novaLength" }
  : { token: "token", voice: "voice", ear: "ear", length: "length" };
if (IS_NOVA) {
  document.title = "NOVA";
  $("title").textContent = "NOVA";
  $("tokenLabel").textContent = "รหัสเจ้าของ";
  startBtns.forEach((b) => (b.hidden = b.dataset.mode !== "nova"));
  orbEl.hidden = false;
  orbEl.className = "idle";
}

let ws = null;
let curMode = "";
let micCtx = null;
let micStream = null;
let proc = null;
let playCtx = null;
let nextTime = 0;
let sources = [];

const readStore = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
tokenIn.value = readStore(KEYS.token) || "";
const savedVoice = readStore(KEYS.voice);
if (/^[1-5]$/.test(readStore(KEYS.length) || "")) $("length").value = readStore(KEYS.length);
voiceSel.value = savedVoice || (IS_NOVA ? "Charon" : "Kore");
// เสียง Paxa Labs แสดงเฉพาะเมื่อเซิร์ฟเวอร์มี key
fetch("/config.json")
  .then((r) => r.json())
  .then(({ paxaVoices, elevenVoices, elevenEar }) => {
    const addGroup = (label, voices) => {
      const ids = Object.keys(voices || {});
      if (!ids.length) return;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const id of ids) group.append(new Option(voices[id], id));
      voiceSel.append(group);
      if (savedVoice && voices[savedVoice]) voiceSel.value = savedVoice;
    };
    addGroup("เสียง Paxa Labs (ไทย)", paxaVoices);
    addGroup("เสียง ElevenLabs (รหัสเจ้าของเท่านั้น)", elevenVoices);
    if (elevenEar) {
      $("earBox").hidden = false;
      $("ear").value = readStore(KEYS.ear) || "gemini";
    }
  })
  .catch(() => {});

function addLine(kind, text) {
  // คำถอดเสียงมาทีละไม่กี่คำ: ต่อท้ายกล่องเดิมของผู้พูดคนเดียวกัน ไม่แตกเป็นกล่องละคำ
  const last = logEl.lastElementChild;
  if ((kind === "bot" || kind === "user") && last?.className === kind) {
    // รหัสอ้างอิงอาจมาแยกเป็นสองท่อน ("[P1," + " P5]") จึงลบหลังต่อข้อความแล้ว
    last.textContent = (last.textContent + text).replace(/\s*\[[^\]]*?\b[SP]\d+[^\]]*\]/g, "");
    logEl.scrollTop = logEl.scrollHeight;
    return;
  }
  const p = document.createElement("p");
  p.className = kind;
  p.textContent = text;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function floatToPcm16Base64(f32) {
  const buf = new ArrayBuffer(f32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytesToB64(new Uint8Array(buf));
}

function pcm16ToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function downsample(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)];
  return out;
}

// คืนเวลาที่ชิ้นนี้เริ่มเล่น (ใช้ให้ข้อความขึ้นพร้อมเสียง)
function playChunk(b64) {
  if (!playCtx) return 0;
  const f32 = pcm16ToFloat32(b64ToBytes(b64));
  const buf = playCtx.createBuffer(1, f32.length, 24000);
  buf.copyToChannel(f32, 0);
  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);
  // เสียงหมดคิวแล้ว: เผื่อ 0.1 วินาทีให้ชิ้นถัดไปที่มาช้าเล็กน้อยต่อได้ไม่สะดุด
  const t = nextTime > playCtx.currentTime ? nextTime : playCtx.currentTime + 0.1;
  src.start(t);
  nextTime = t + buf.duration;
  lastAudioStart = t;
  sources.push(src);
  src.onended = () => {
    sources = sources.filter((s) => s !== src);
  };
  return t;
}

// ผู้ช่วยกำลังพูดอยู่ไหม (tail = นับเลยเวลาจบเสียงไปอีกกี่วินาที)
const isSpeaking = (tail = 0) => !!playCtx && playCtx.currentTime < nextTime + tail;

// บอกผู้ใช้ตลอดว่าตอนนี้ฟังอยู่หรือพูดอยู่ จะได้รู้ว่าพูดต่อได้เลยโดยไม่ต้องกดอะไร
let talkTimer = null;
function watchTalk(on) {
  clearInterval(talkTimer);
  talkEl.textContent = "";
  if (IS_NOVA) orbEl.className = "idle";
  if (!on) return;
  talkTimer = setInterval(() => {
    const speaking = isSpeaking(0.5);
    talkEl.textContent = speaking ? "🔊 กำลังพูด… ฟังจบแล้วพูดต่อได้เลย" : "🎤 กำลังฟัง… พูดได้เลย";
    if (IS_NOVA) orbEl.className = speaking ? "speaking" : "";
  }, 250);
}

// แสดงข้อความตอนที่เสียงช่วงนั้นเริ่มเล่น ไม่ใช่ตอนที่ข้อความมาถึง
let lastAudioStart = 0;
let textTimers = [];
function showAt(kind, text, when) {
  const delay = playCtx ? Math.max(0, when - playCtx.currentTime) * 1000 : 0;
  if (delay < 30) return addLine(kind, text);
  const id = setTimeout(() => {
    textTimers = textTimers.filter((x) => x !== id);
    addLine(kind, text);
  }, delay);
  textTimers.push(id);
}

function stopPlayback() {
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources = [];
  nextTime = 0;
  textTimers.forEach(clearTimeout); // เสียงที่ยังไม่ได้เล่นถูกตัดทิ้ง ข้อความของช่วงนั้นก็ไม่ต้องขึ้น
  textTimers = [];
}

// เบราว์เซอร์ในแอป (LINE, Facebook, Instagram, Android WebView) มักไม่ให้ใช้ไมค์
const IN_APP = /Line\/|FBAN|FBAV|Instagram|; wv\)/i.test(navigator.userAgent);

// ขอไมค์ตอนกดปุ่ม (ในจังหวะที่ผู้ใช้กด) บางเบราว์เซอร์ปฏิเสธถ้าขอทีหลัง
async function askMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    return true;
  } catch (e) {
    micStream = null;
    addLine("sys", micHelp(e));
    return false;
  }
}

function micHelp(e) {
  const tail = " ระหว่างนี้พิมพ์ข้อความแทนได้";
  if (IN_APP) return 'แอปนี้เปิดไมค์ไม่ได้ กด ⋮ (หรือ …) มุมบน แล้วเลือก "เปิดในเบราว์เซอร์" หรือ "เปิดใน Chrome" แล้วกดเริ่มใหม่' + tail;
  if (e?.name === "NotAllowedError") {
    return (
      "สิทธิ์ไมค์ของเว็บนี้ถูกปิดอยู่ เปิดได้ 2 ทาง แล้วกด จบ และเริ่มใหม่:\n" +
      "1) ใน Chrome: กด ⋮ > การตั้งค่า > การตั้งค่าเว็บไซต์ > ไมโครโฟน > counsel.srv2091778.hstgr.cloud > อนุญาต\n" +
      "2) ถ้ายังไม่ได้: การตั้งค่ามือถือ > แอป > Chrome > สิทธิ์ > ไมโครโฟน > อนุญาต" +
      tail
    );
  }
  if (e?.name === "NotFoundError") return "ไม่พบไมโครโฟนในเครื่องนี้" + tail;
  return `ใช้ไมค์ไม่ได้: ${e?.message || e}` + tail;
}

// ส่งเสียงเฉพาะตอนมีคนพูด (หลักเดียวกับ NOVA บน PC: speech_gate.py) Gemini คิดเงินทุกวินาทีที่ได้รับ รวมช่วงเงียบ
// ส่งเสียงก่อนเริ่มพูดสั้น ๆ (คำแรกไม่ขาด) และหลังหยุดพูด 1.2 วินาที (Gemini รู้ว่าพูดจบ)
// ช่วงเงียบส่งชิ้นเดียวทุก 10 วินาที กันการเชื่อมต่อถูกปิดเพราะเงียบ
// ponytail: ตัดสินจากความดังอย่างเดียว ถ้าเสียงพื้นห้องดังจนส่งตลอด ค่อยเปลี่ยนเป็นตัวจับเสียงพูดจริง
const GATE = { peak: 0.03, tailS: 1.2, leadChunks: 4, keepaliveS: 10 };
const gate = { lead: [], lastVoice: -Infinity, lastSent: -Infinity, floor: 0.01 };
function gateFeed(msg, peak, now) {
  const talking = now - gate.lastVoice <= GATE.tailS;
  let out;
  if (peak > Math.max(GATE.peak, gate.floor * 3)) {
    out = talking ? [] : gate.lead; // เริ่มพูด: ส่งเสียงก่อนหน้าไปก่อน
    gate.lead = [];
    gate.lastVoice = now;
    out.push(msg);
  } else if (talking) {
    out = [msg];
  } else {
    gate.floor = 0.95 * gate.floor + 0.05 * peak; // เรียนรู้เสียงพื้นห้องตอนเงียบ
    if (now - gate.lastSent < GATE.keepaliveS) {
      gate.lead.push(msg);
      if (gate.lead.length > GATE.leadChunks) gate.lead.shift();
      return [];
    }
    out = [msg];
  }
  gate.lastSent = now;
  return out;
}

// ไม่มีใครพูดนานเกิน 3 นาที: ตัดการเชื่อมต่อเอง ไม่เสียค่าใช้งานต่อ (เบราว์เซอร์ไม่ให้เว็บปิดแท็บตัวเอง)
const IDLE_LIMIT_S = 180;
let lastActivity = 0;
let idleTimer = null;
const touch = () => (lastActivity = performance.now() / 1000);
function checkIdle() {
  if (!ws) return;
  if (isSpeaking(0)) return touch();
  if (performance.now() / 1000 - Math.max(lastActivity, gate.lastVoice) > IDLE_LIMIT_S) {
    stop();
    addLine("sys", "ไม่มีเสียงพูด 3 นาที จึงตัดการเชื่อมต่อให้แล้ว ไม่เสียค่าใช้งานต่อ กดเริ่มใหม่ได้เลย");
  }
}

// ต่อไมค์ที่ได้จาก askMic() เข้ากับการส่งเสียงขึ้นเซิร์ฟเวอร์
function startMic() {
  micCtx = new AudioContext();
  const src = micCtx.createMediaStreamSource(micStream);
  proc = micCtx.createScriptProcessor(4096, 1, 1);
  const mute = micCtx.createGain();
  mute.gain.value = 0;
  proc.onaudioprocess = (ev) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // ระหว่างผู้ช่วยพูด (และอีกครึ่งวินาทีหลังจบ) ไม่ส่งเสียงไมค์ กันเสียงลำโพงย้อนเข้าไมค์
    // จนผู้ช่วยได้ยินตัวเองแล้วตอบวนหรือตัดคำตอบตัวเอง ponytail: พูดแทรกระหว่างผู้ช่วยพูดไม่ได้ ถ้าต้องการค่อยเพิ่มปุ่มหยุด
    if (isSpeaking(0.5)) return;
    const input = ev.inputBuffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < input.length; i += 4) peak = Math.max(peak, Math.abs(input[i]));
    if (IS_NOVA) orbEl.style.setProperty("--lvl", Math.min(1, peak * 3).toFixed(2)); // วงกลมขยายตามเสียงผู้ใช้
    const msg = JSON.stringify({ type: "audio", data: floatToPcm16Base64(downsample(input, micCtx.sampleRate, 16000)) });
    const now = performance.now() / 1000;
    for (const m of gateFeed(msg, peak, now)) ws.send(m);
    // จบประโยค (พ้นช่วงท้ายหลังหยุดพูด): บอกเซิร์ฟเวอร์ ใช้กับหู ElevenLabs ที่ถอดทีละประโยค
    const talkingNow = now - gate.lastVoice <= GATE.tailS;
    if (gate.wasTalking && !talkingNow) ws.send(JSON.stringify({ type: "utterance_end" }));
    gate.wasTalking = talkingNow;
  };
  src.connect(proc);
  proc.connect(mute);
  mute.connect(micCtx.destination);
}

function stopMic() {
  proc?.disconnect();
  micStream?.getTracks().forEach((t) => t.stop());
  micCtx?.close();
  proc = micStream = micCtx = null;
}

function handle(msg) {
  touch(); // มีอะไรเข้ามาจากเซิร์ฟเวอร์ = ยังคุยกันอยู่
  switch (msg.type) {
    case "ready":
      statusEl.textContent = `${MODE_TH[msg.mode] || ""} · ${voiceSel.selectedOptions[0]?.text || msg.voice} · คุยต่อเนื่องได้เลย ไม่ต้องกดอะไรอีก`;
      if (micStream && !proc) startMic(); // ต่อใหม่หลังหลุด: ไมค์ทำงานอยู่แล้ว ไม่ต้องต่อซ้ำ
      if (micStream) watchTalk(true);
      break;
    case "reconnecting":
      statusEl.textContent = "การเชื่อมต่อหลุด กำลังต่อใหม่ให้เอง…";
      break;
    case "audio":
      playChunk(msg.data);
      break;
    case "interrupted":
      stopPlayback();
      break;
    case "user_text":
      addLine("user", msg.text);
      break;
    case "bot_text":
      // เสียง Gemini: คำถอดเสียงมาพร้อมเสียงชิ้นล่าสุด ขึ้นข้อความตอนชิ้นนั้นเล่น
      showAt("bot", msg.text, lastAudioStart);
      break;
    case "speech": {
      // เสียง Paxa: ข้อความหนึ่งช่วงคู่กับเสียงของช่วงนั้น
      const starts = (msg.chunks || []).map(playChunk);
      showAt("bot", msg.text, starts.length ? starts[0] : 0);
      break;
    }
    case "crisis":
      addLine("crisis", msg.text);
      break;
    case "searching":
      statusEl.textContent = "กำลังค้นคำสอน…";
      break;
    case "sources":
      if (msg.items?.length) addLine("src", "ที่มาที่ค้นเจอ:\n" + msg.items.map((c, i) => `${i + 1}. ${c}`).join("\n"));
      statusEl.textContent = "กำลังตอบ…";
      break;
    case "error":
      addLine("sys", msg.message);
      break;
    case "closed":
      statusEl.textContent = "จบการเชื่อมต่อแล้ว";
      break;
  }
}

async function start(mode) {
  const token = tokenIn.value.trim();
  if (!token) return addLine("sys", IS_NOVA ? "ใส่รหัสเจ้าของก่อน" : "ใส่รหัสเชิญก่อน");
  try {
    localStorage.setItem(KEYS.token, token);
    localStorage.setItem(KEYS.voice, voiceSel.value);
    localStorage.setItem(KEYS.ear, $("ear").value);
    localStorage.setItem(KEYS.length, $("length").value);
  } catch {}

  // ปลดล็อกเสียงเล่นและขอไมค์ต้องเกิดจากการกดปุ่ม (ข้อกำหนดของ iOS และเบราว์เซอร์มือถือ)
  playCtx = new AudioContext({ sampleRate: 24000 });
  await playCtx.resume();
  startBtns.forEach((b) => (b.disabled = true));
  await askMic(); // ไม่ได้ไมค์ก็ยังคุยด้วยการพิมพ์ได้

  voiceSel.disabled = true; // เสียงตั้งตอนเริ่มเท่านั้น ล็อกไว้ให้สิ่งที่เห็นตรงกับเสียงที่ได้ยิน
  $("ear").disabled = true;
  $("length").disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "กำลังเชื่อมต่อ...";
  addLine("sys", `เริ่มโหมด${MODE_TH[mode]}`);
  curMode = mode;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${scheme}://${location.host}/ws`);
  const ear = $("earBox").hidden ? "gemini" : $("ear").value;
  const length = Number($("length").value) || 2;
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token, mode, voice: voiceSel.value, ear, length }));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => stop();
  Object.assign(gate, { lead: [], lastVoice: -Infinity, lastSent: -Infinity, wasTalking: false });
  touch();
  idleTimer = setInterval(checkIdle, 5000);
}

startBtns.forEach((b) => (b.onclick = () => start(b.dataset.mode)));

// เตือนก่อนกดเริ่ม: เปิดในแอปอื่น หรือเคยปฏิเสธสิทธิ์ไมค์ไว้
if (IN_APP) addLine("sys", micHelp());
navigator.permissions
  ?.query({ name: "microphone" })
  .then((p) => {
    if (p.state === "denied" && !IN_APP) addLine("sys", micHelp({ name: "NotAllowedError" }));
  })
  .catch(() => {});

function stop() {
  clearInterval(idleTimer);
  ws?.close();
  ws = null;
  stopMic();
  stopPlayback();
  playCtx?.close();
  playCtx = null;
  watchTalk(false);
  startBtns.forEach((b) => (b.disabled = false));
  voiceSel.disabled = false;
  $("ear").disabled = false;
  $("length").disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = "ยังไม่ได้เชื่อมต่อ";
}

stopBtn.onclick = stop;

$("form").onsubmit = (e) => {
  e.preventDefault();
  const text = textIn.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "text", text }));
  addLine("me", text);
  touch();
  textIn.value = "";
};

// ตอบไม่ถูก: ส่งคำตอบล่าสุด คำถามก่อนหน้า ที่มา และคำตอบที่ถูก (ถ้าผู้ใช้พิมพ์) ไปเก็บไว้ใช้ปรับ prompt
$("wrong").onclick = async () => {
  const bots = logEl.querySelectorAll("p.bot");
  const answer = bots[bots.length - 1];
  if (!answer) return addLine("sys", "ยังไม่มีคำตอบให้รายงาน");
  const sources = [];
  let question = answer.previousElementSibling;
  while (question && question.className !== "user" && question.className !== "me") {
    if (question.className === "src") sources.unshift(question.textContent);
    question = question.previousElementSibling;
  }
  const picked = $("wrongFile").files[0];
  if (picked && picked.size > 10 * 1024 * 1024) return addLine("sys", "ไฟล์แนบใหญ่เกิน 10 MB");
  const correct = prompt("ตอบไม่ถูกตรงไหน หรือคำตอบที่ถูกควรเป็นอย่างไร (เว้นว่างได้)");
  if (correct === null) return; // กดยกเลิก
  try {
    // ไฟล์แนบส่งเป็น base64 ในก้อนเดียวกัน เซิร์ฟเวอร์เช็กหัวไฟล์จริงอีกชั้น
    const file = picked
      ? {
          name: picked.name,
          type: picked.type,
          data: await new Promise((ok, fail) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(",")[1]);
            r.onerror = fail;
            r.readAsDataURL(picked);
          }),
        }
      : undefined;
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenIn.value.trim()}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: IS_NOVA ? "nova-web" : "web",
        mode: curMode,
        question: question?.textContent || "",
        answer: answer.textContent,
        sources: sources.join("\n"),
        correct,
        file,
      }),
    });
    if (res.ok) {
      addLine("sys", `บันทึกแล้ว${picked ? ` พร้อมไฟล์ ${picked.name}` : ""} ขอบคุณครับ จะนำไปปรับคำตอบ`);
      $("wrongFile").value = "";
    } else {
      const why = (await res.json().catch(() => ({}))).error;
      addLine("sys", `บันทึกไม่สำเร็จ: ${why || "ตรวจรหัสแล้วลองใหม่"}`);
    }
  } catch {
    addLine("sys", "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
};

if ("serviceWorker" in navigator) {
  // service worker ตัวใหม่เข้าคุมหน้าแล้ว (หลังอัปเดต) โหลดหน้าใหม่ครั้งเดียว จะได้ไม่ค้างหน้าเก่า
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !ws) location.reload();
  });
  navigator.serviceWorker.register("/sw.js");
}
