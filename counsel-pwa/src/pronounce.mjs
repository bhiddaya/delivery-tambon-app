// คำอ่านเฉพาะ (ศัพท์บาลี/ธรรมะ) ที่เสียงอ่านผิด ที่เดียวใช้ทุกที่:
//   เสียง Paxa/ElevenLabs: แทนคำในข้อความก่อนสังเคราะห์ (sayable ใน paxa.mjs)
//   เสียง Gemini (เว็บ และ NOVA บน PC ผ่าน /config.json): เปลี่ยนตัวสะกดในข้อความที่ส่งให้ Gemini อ่าน
//   (ทดสอบแล้ว บอกคำอ่านใน system prompt Gemini พูดคำอธิบายคำอ่านออกมาด้วย "อนิยต อ่านว่า อะ-นิ-ยะ-ตะ")
// เพิ่มคำใหม่ที่นี่ แล้ว deploy: คำ -> คำอ่านแยกพยางค์ด้วยขีด
export const PRONOUNCE = {
  อนิยต: "อะ-นิ-ยะ-ตะ", // เจ้าของแก้ 25 พ.ย. 2569: "อนิยตโพธิสัตว์ อ่านว่า อะ นิ ยะ ตะ โพธิสัตว์"
  นิยต: "นิ-ยะ-ตะ", // คู่กัน (นิยตโพธิสัตว์) อ่านแบบเดียวกัน
};

// คำยาวก่อน: "อนิยต" ต้องแทนก่อน "นิยต" ที่อยู่ข้างใน
const WORDS = Object.keys(PRONOUNCE).sort((a, b) => b.length - a.length);
const PATTERN = WORDS.length ? new RegExp(WORDS.join("|"), "g") : null;

// ข้อความสำหรับเครื่องสังเคราะห์เสียง: ใช้คำอ่านติดกันไม่มีขีด ("อะนิยะตะโพธิสัตว์")
export const sayWords = (text) => (PATTERN ? String(text).replace(PATTERN, (w) => PRONOUNCE[w].replace(/-/g, "")) : String(text));

