// ห้องทดลอง /lab: เทียบหู สมอง ปาก หลายแบบ (ใช้รหัสเจ้าของ)
const $ = (id) => document.getElementById(id);

const PASSAGE = `เมื่อเกิดปัญญาเกิดวิมุติ ก็มีปัญญารู้จักวิมุติ เรียกวิมุตติญาณทัสสนะ รวบรวมเป็นปัญญา ก็มีปัญญา ๘ ที่เรียกว่า วิชชา ๘
๑. วิปัสสนาญาณ (ความรู้แจ้งเห็นจริง หรือรู้ความจริงในเหตุที่มีความจริงเกิด รู้กิเลสตายจริง อกุศลดับจริง)
๒. มโนมยิทธิญาณ (ความมีฤทธิ์ทางจิต ที่จิตสามารถเนรมิต "ความเกิด" อย่างใหม่ขึ้นมาได้)
๓. อิทธิวิธญาณ (ความเก่งหลายอย่างในการที่จิตมีอานุภาพ เพราะปราศจากกิเลสแล้ว)
๔. ทิพโสตญาณ (สามารถแยกแยะ การได้ยินสิ่งที่ละเอียดลึกซึ้ง เช่น กิเลสปะปนมากับคำร่ำลือ กับเสียงที่เกินกว่าคนธรรมดาเขาจะรู้นัยยะได้)
๕. เจโตปริยญาณ (กำหนดรู้ความแตกต่างในจิตขั้นอื่นๆของตนได้รอบถ้วน)
๖. ปุพเพนิวาสานุสสติญาณ (การย้อนระลึกถึงการเกิดกิเลสเก่าก่อน มารู้อาริยสัจจะจนหายโง่จากอวิชชา)
๗. จุตูปปาตญาณ (รู้เห็นการเกิด-การดับของจิตที่ดับเชื้อกิเลส แล้วเกิดเป็นสัตว์เทวดา หรือสัตว์อาริยะ)
๘. อาสวักขยญาณ (ญาณที่รู้การหมดสิ้นอาสวะของตน)
(พตฐ. เล่ม ๙ ข้อ ๑๒๗ - ๑๓๘)`;

$("ref").value = PASSAGE;
$("say").value = PASSAGE.split("\n").slice(0, 4).join("\n");
try {
  $("token").value = localStorage.getItem("ownerToken") || "";
} catch {}
$("token").onchange = () => {
  try {
    localStorage.setItem("ownerToken", $("token").value.trim());
  } catch {}
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const sec = (ms) => `${(ms / 1000).toFixed(1)} วิ`;

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { authorization: `Bearer ${$("token").value.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res;
}

function card(box, title, meta, text, isErr) {
  const div = document.createElement("div");
  div.className = "result";
  div.innerHTML = `<b>${esc(title)}</b> <span class="meta">${esc(meta)}</span>\n<span class="${isErr ? "err" : ""}">${esc(text)}</span>`;
  box.appendChild(div);
}

// ---------- ความตรงของคำถอดเสียง: 1 - ระยะแก้ไข / ความยาวต้นฉบับ (ไม่นับช่องว่าง วรรคตอน เลขไทย=เลขอารบิก) ----------
const norm = (s) =>
  s
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[\s.,()"“”'‘’\-–:;!?]/g, "")
    .toLowerCase();
function score(text) {
  const a = norm($("ref").value);
  const b = norm(text);
  if (!a.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.max(0, Math.round((1 - prev[b.length] / a.length) * 100));
}

// ---------- 1. หู ----------
let rec = null; // { ctx, stream, proc, chunks, rate, speech, said, started }
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

$("rec").onclick = async () => {
  $("earResults").innerHTML = "";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    $("recStatus").textContent = `ใช้ไมค์ไม่ได้: ${e.message}`;
    return;
  }
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  rec = { ctx, stream, proc, chunks: [], rate: ctx.sampleRate, said: [], started: Date.now() };
  proc.onaudioprocess = (ev) => rec?.chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  if ($("ear-browser").checked && SpeechRec) {
    const s = new SpeechRec();
    s.lang = "th-TH";
    s.continuous = true;
    s.interimResults = false;
    s.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) rec?.said.push(e.results[i][0].transcript);
    };
    s.onend = () => {
      if (rec?.speech === s && !rec.stopping) s.start(); // Chrome หยุดเองเมื่อเงียบนาน: เริ่มต่อ
    };
    s.start();
    rec.speech = s;
  }
  $("rec").disabled = true;
  $("recStop").disabled = false;
  $("recStatus").textContent = "กำลังอัด… อ่านข้อความทดสอบได้เลย";
};

function toWav16k(chunks, rate) {
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) all.set(c, (o += c.length) - c.length);
  const ratio = rate / 16000;
  const n = Math.floor(all.length / ratio);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (p, s) => [...s].forEach((ch, i) => v.setUint8(p + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function b64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

$("recStop").onclick = async () => {
  const r = rec;
  if (!r) return;
  r.stopping = true;
  $("recStop").disabled = true;
  r.proc.disconnect();
  r.stream.getTracks().forEach((t) => t.stop());
  await r.ctx.close();
  if (r.speech) {
    await new Promise((ok) => {
      r.speech.onend = ok;
      r.speech.stop();
      setTimeout(ok, 2000);
    });
  }
  rec = null;
  const seconds = (Date.now() - r.started) / 1000;
  $("recStatus").textContent = `อัดได้ ${seconds.toFixed(0)} วินาที กำลังถอดเสียง…`;
  const box = $("earResults");
  if (r.speech) {
    const text = r.said.join(" ");
    card(box, "เบราว์เซอร์", `ตรง ${score(text)}% · ถอดระหว่างพูด`, text || "(ไม่ได้ยินอะไร)");
  } else if ($("ear-browser").checked) {
    card(box, "เบราว์เซอร์", "", "เบราว์เซอร์นี้ไม่มีตัวฟังเสียง (ลอง Chrome)", true);
  }
  const wav = b64(toWav16k(r.chunks, r.rate));
  const vocab = $("vocab").checked;
  const names = {
    whisper: "Whisper (Cloudflare)",
    gemini: "Gemini 3.8 Flash",
    paxa: "Paxa STT",
    iapp: "iApp Chinda ASR",
    eleven: "ElevenLabs Scribe",
  };
  await Promise.all(
    Object.keys(names)
      .filter((ear) => $(`ear-${ear}`).checked)
      .map(async (ear) => {
        const t = Date.now();
        try {
          const { text, via } = await (await api("/api/lab/stt", { ear, wav, vocab })).json();
          card(box, names[ear], `ตรง ${score(text)}% · ${sec(Date.now() - t)}${vocab ? " · มีคำช่วยฟัง" : ""}${via ? ` · ${via}` : ""}`, text || "(ว่าง)");
        } catch (e) {
          card(box, names[ear], sec(Date.now() - t), e.message, true);
        }
      }),
  );
  $("recStatus").textContent = `อัด ${seconds.toFixed(0)} วินาที ถอดเสียงครบแล้ว`;
  $("rec").disabled = false;
};

// ---------- 2. สมอง ----------
$("ask").onclick = async () => {
  const box = $("brainResults");
  box.innerHTML = "";
  $("ask").disabled = true;
  const t = Date.now();
  card(box, "กำลังค้นคลังและถามทุกสมอง…", "", "");
  try {
    const { results } = await (await api("/api/lab/brain", { question: $("question").value, mode: $("mode").value })).json();
    box.innerHTML = "";
    for (const r of results) {
      if (r.error) card(box, r.label, sec(r.ms), r.error, true);
      else {
        const extra = (r.cites?.length ? `\n\nที่มา: ${r.cites.join(" | ")}` : "") + (r.removed ? `\n(ตัดคำพูดที่ไม่มีในต้นฉบับออก ${r.removed} ที่)` : "");
        card(box, r.label, `${sec(r.ms)} · ${r.text.length} ตัวอักษร`, r.text + extra);
      }
    }
  } catch (e) {
    box.innerHTML = "";
    card(box, "ถามไม่สำเร็จ", sec(Date.now() - t), e.message, true);
  }
  $("ask").disabled = false;
};

// ---------- 3. ปาก ----------
fetch("/config.json")
  .then((r) => r.json())
  .then(({ paxaVoices }) => {
    for (const [id, title] of Object.entries(paxaVoices || {})) $("paxaVoice").add(new Option(title, id));
  })
  .catch(() => {});

$("elevenLoad").onclick = async () => {
  const sel = $("elevenVoice");
  try {
    const { voices } = await (await api("/api/lab/voices", {})).json();
    sel.innerHTML = "";
    for (const v of voices) sel.add(new Option(v.name, v.id));
    if (!voices.length) sel.add(new Option("บัญชีนี้ยังไม่มีเสียง", ""));
  } catch (e) {
    card($("mouthResults"), "ElevenLabs", "", e.message, true);
  }
};

// ---------- 4. ภาษาอื่น ----------
const ML_LANGS = {
  en: "English อังกฤษ", zh: "中文 จีน", ja: "日本語 ญี่ปุ่น", ko: "한국어 เกาหลี", lo: "ລາວ ลาว", my: "မြန်မာ พม่า",
  km: "ខ្មែរ เขมร", vi: "Tiếng Việt เวียดนาม", hi: "हिन्दी ฮินดี", de: "Deutsch เยอรมัน", fr: "Français ฝรั่งเศส", es: "Español สเปน",
};
for (const [code, name] of Object.entries(ML_LANGS)) {
  const label = document.createElement("label");
  label.innerHTML = `<input type="checkbox" value="${code}"${["en", "zh", "ja"].includes(code) ? " checked" : ""}> ${esc(name)}`;
  $("mlLangs").append(label);
}
const stars = (n) => (n ? `${n}/5` : "-");

$("mlRun").onclick = async () => {
  const langs = [...$("mlLangs").querySelectorAll("input:checked")].map((i) => i.value);
  const box = $("mlResults");
  box.innerHTML = "";
  if (!langs.length) return card(box, "เลือกภาษาก่อน", "", "สูงสุด 6 ภาษาต่อครั้ง", true);
  const voice = $("mlVoice").checked ? $("elevenVoice").value : "";
  $("mlRun").disabled = true;
  const t = Date.now();
  card(box, "กำลังตรวจ…", "", `${langs.length} ภาษา`);
  try {
    const r = await (
      await api("/api/lab/multilang", {
        question: $("mlQuestion").value, langs, keyterms: $("mlTerms").value, voice: voice ? `el:${voice}` : "",
        length: Number($("mlLength").value), mode: "dhamma",
      })
    ).json();
    box.innerHTML = "";
    card(box, "ไทย (ต้นแบบ)", `คำสำคัญ ${r.thai.terms.hit}/${r.thai.terms.total} · อ้างคลัง ${r.thai.cites} · ${sec(r.thai.ms)}`, r.thai.answer);
    for (const x of r.results) {
      if (x.error) {
        card(box, `${x.native} (${x.th})`, sec(x.ms), x.error, true);
        continue;
      }
      const j = x.judge;
      const score = j.error ? `ผู้ตรวจ: ${j.error}` : `ตรงต้นฉบับ ${stars(j.faithful)} · ภาษา ${stars(j.language)} · ครบ ${stars(j.complete)}`;
      const voiceLine = x.voice ? (x.voice.error ? ` · เสียง: ${x.voice.error}` : ` · เสียงไปกลับตรง ${x.voice.score}%`) : "";
      const missing = x.terms.missing.length ? `\nคำสำคัญที่ขาด: ${x.terms.missing.join(", ")}` : "";
      card(
        box,
        `${x.native} (${x.th})`,
        `${score} · คำสำคัญ ${x.terms.hit}/${x.terms.total} · อ้างคลัง ${x.cites}${voiceLine} · ${sec(x.ms)}`,
        `ถาม: ${x.question}\n\nตอบ: ${x.answer}\n\nแปลกลับเป็นไทย: ${x.back}` +
          (j.issues ? `\n\nผู้ตรวจ: ${j.issues}` : "") + missing + (x.voice?.heard ? `\n\nถอดเสียงกลับได้: ${x.voice.heard}` : ""),
      );
    }
  } catch (e) {
    box.innerHTML = "";
    card(box, "ตรวจไม่สำเร็จ", sec(Date.now() - t), e.message, true);
  }
  $("mlRun").disabled = false;
};

let playing = null;
document.querySelectorAll("[data-mouth]").forEach((btn) => {
  btn.onclick = async () => {
    const mouth = btn.dataset.mouth;
    const text = $("say").value.trim();
    if (!text) return;
    playing?.pause();
    speechSynthesis.cancel();
    const box = $("mouthResults");
    if (mouth === "browser") {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "th-TH";
      u.voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith("th")) || null;
      speechSynthesis.speak(u);
      card(box, "เสียงในเบราว์เซอร์", u.voice ? u.voice.name : "ไม่มีเสียงไทยในเครื่อง ใช้เสียงเริ่มต้น", "กำลังพูด…");
      return;
    }
    const voice = {
      paxa: $("paxaVoice").value,
      gemini: $("geminiVoice").value,
      iapp: `${$("iappVoice").value}|${$("iappStyle").value}`,
      eleven: `${$("elevenVoice").value}|${$("elevenModel").value}`,
    }[mouth];
    const label = {
      eleven: `ElevenLabs ${$("elevenVoice").selectedOptions[0]?.text || ""} · ${$("elevenModel").value}`,
      paxa: `Paxa ${$("paxaVoice").selectedOptions[0]?.text || voice}`,
      gemini: `Gemini TTS ${voice}`,
      iapp: `iApp ${$("iappVoice").selectedOptions[0]?.text} · ${$("iappStyle").selectedOptions[0]?.text}`,
    }[mouth];
    btn.disabled = true;
    const t = Date.now();
    try {
      const blob = await (await api("/api/lab/tts", { mouth, voice, text })).blob();
      playing = new Audio(URL.createObjectURL(blob));
      playing.play();
      card(box, label, `ได้เสียงใน ${sec(Date.now() - t)}`, "กำลังเล่น…");
    } catch (e) {
      card(box, label, sec(Date.now() - t), e.message, true);
    }
    btn.disabled = false;
  };
});
