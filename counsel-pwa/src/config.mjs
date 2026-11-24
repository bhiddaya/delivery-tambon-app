// ค่าตั้งต้นของ counsel-pwa อ่านจาก environment ได้ทั้งหมด
import { readFile } from "node:fs/promises";

// เสียงที่เลือกได้ใน Gemini Live (ชื่อจาก prebuilt voices)
// ค่าเริ่มต้นเป็นเสียงผู้หญิง ตรวจเสียงจริงบนเครื่องก่อนใช้งาน
export const VOICES = {
  female: ["Kore", "Aoede", "Leda", "Zephyr"],
  male: ["Puck", "Charon", "Fenrir"],
};

// รหัสรายคน: ไฟล์ JSON { "รหัส": "ชื่อ" } อ่านใหม่ทุกครั้งที่มีคนเข้า เพิ่ม/ลบในไฟล์แล้วมีผลทันที ไม่ต้อง restart
// คืนชื่อเจ้าของรหัส หรือ null ถ้าไม่มีรหัสนี้ / ไฟล์อ่านไม่ได้
export async function findPerson(file, token) {
  if (typeof token !== "string" || !token) return null;
  try {
    const codes = JSON.parse(await readFile(file, "utf8"));
    return Object.hasOwn(codes, token) ? String(codes[token]) : null;
  } catch {
    return null;
  }
}

export function loadConfig(env = process.env) {
  const voice = env.LIVE_VOICE || "Kore";
  const allowed = [...VOICES.female, ...VOICES.male];
  return {
    port: Number(env.PORT || 8080),
    geminiApiKey: env.GEMINI_API_KEY || "",
    // ตรวจชื่อโมเดลกับหน้า deprecations ของ Google ก่อนใช้งานจริง
    liveModel: env.LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025",
    voice: allowed.includes(voice) ? voice : "Kore",
    // โทเค็นเชิญสำหรับทดสอบ ยังไม่ใช่การล็อกอินด้วย LINE
    inviteToken: env.INVITE_TOKEN || "",
    // รหัสเจ้าของ: เข้าหน้า NOVA (/nova) ได้ และใช้โหมดอื่นได้ด้วย
    ownerToken: env.OWNER_TOKEN || "",
    // กุญแจของ n8n (LINE OA บวรไทย) เรียก /api/line/answer
    lineToken: env.LINE_API_TOKEN || "",
    codesFile: env.CODES_FILE || "access/codes.json",
    dailyLimitPerToken: Number(env.DAILY_LIMIT || 30),
    // ค้นคำสอน: ครบทั้งสี่ค่าจึงเปิดเครื่องมือค้น
    cfAccountId: env.CF_ACCOUNT_ID || "",
    cfApiToken: env.CF_API_TOKEN || "",
    qdrantUrl: (env.QDRANT_URL || "http://qdrant:6333").replace(/\/$/, ""),
    qdrantReadKey: env.QDRANT_READ_KEY || "",
    // โหมดถามธรรมะ: Haiku เรียบเรียงคำตอบ (ใส่ OPENROUTER_API_KEY หรือ LLM_BRIDGE_URL + LLM_BRIDGE_SECRET)
    composeModel: env.COMPOSE_MODEL || "anthropic/claude-haiku-5.5",
    openrouterKey: env.OPENROUTER_API_KEY || "",
    llmBridgeUrl: env.LLM_BRIDGE_URL || "",
    llmBridgeSecret: env.LLM_BRIDGE_SECRET || "",
    // เสียง Paxa Labs ให้เลือก (ไม่ใส่ = มีแต่เสียง Gemini)
    paxaApiKey: env.PAXA_API_KEY || "",
    // iApp (หูและปากภาษาไทย) ใช้ในหน้า /lab
    iappApiKey: env.IAPP_API_KEY || "",
    elevenApiKey: env.ELEVENLABS_API_KEY || "",
    // ข้อความที่ใช้ตอบเมื่อพบสัญญาณวิกฤต
    crisisMessage:
      "ถ้าคุณกำลังคิดทำร้ายตัวเองหรือไม่อยากอยู่ต่อ กรุณาโทร 1323 สายด่วนสุขภาพจิต หรือ 1669 ถ้าเป็นเหตุฉุกเฉินตอนนี้",
  };
}
