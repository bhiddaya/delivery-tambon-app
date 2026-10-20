import crypto from "crypto";

/**
 * ใบสมัครที่เปิดจากปุ่มใน LINE OA บวรไทย — ใช้ร่วมกันทั้งหน้าสมัคร (client) และ API (server)
 * ค่า type / ลายเซ็น / ช่องต่าง ๆ ตรงกับ workflow n8n เดิม เพื่อให้ปุ่มเดิมใช้ต่อได้
 */

export const SIGNUP_TYPES = [
  "merchant",
  "motorcycle",
  "personal",
  "tractor",
  "harvester",
  "rice_transplanter",
  "drone",
  "jobseeker",
] as const;
export type SignupType = (typeof SIGNUP_TYPES)[number];

export const SIGNUP_LABEL: Record<SignupType, string> = {
  merchant: "สมัครร้านค้า",
  motorcycle: "สมัครไรเดอร์ (มอเตอร์ไซค์)",
  personal: "สมัครรถส่วนบุคคล",
  tractor: "สมัครรถไถ",
  harvester: "สมัครรถเกี่ยวข้าว",
  rice_transplanter: "สมัครรถดำนา",
  drone: "สมัครโดรน",
  jobseeker: "สมัครงาน",
};

export type SignupGroup = "merchant" | "driver" | "personal" | "jobseeker";

export function signupGroup(type: SignupType): SignupGroup {
  if (type === "merchant" || type === "personal" || type === "jobseeker") return type;
  return "driver";
}

export type FieldKey =
  | "shop_name"
  | "shop_category"
  | "shop_address"
  | "contact_name"
  | "full_name"
  | "occupation"
  | "skills"
  | "area"
  | "phone"
  | "plate"
  | "vehicle_kind"
  | "promptpay";

export type FieldDef = {
  key: FieldKey;
  label: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
  options?: string[];
};

const NAME: FieldDef = { key: "full_name", label: "ชื่อ-นามสกุล", required: true, placeholder: "ชื่อจริง นามสกุล" };
const PHONE: FieldDef = { key: "phone", label: "เบอร์โทร", required: true, placeholder: "08xxxxxxxx" };
const PROMPTPAY: FieldDef = { key: "promptpay", label: "พร้อมเพย์", placeholder: "เลขพร้อมเพย์สำหรับรับเงิน (ถ้ามี)" };

export const GROUP_FIELDS: Record<SignupGroup, FieldDef[]> = {
  merchant: [
    { key: "shop_name", label: "ชื่อร้าน", required: true, placeholder: "เช่น ร้านข้าวแกงป้าแดง" },
    { key: "shop_category", label: "ประเภทร้าน", required: true, placeholder: "เช่น ร้านอาหาร ร้านของแห้ง ร้านซ่อมรถ" },
    { key: "shop_address", label: "ที่อยู่ร้าน", required: true, textarea: true, placeholder: "บ้านเลขที่ หมู่ จุดสังเกต" },
    { key: "contact_name", label: "ชื่อผู้ติดต่อ", required: true, placeholder: "ชื่อ-นามสกุล เจ้าของร้าน" },
    PHONE,
    PROMPTPAY,
  ],
  driver: [
    NAME,
    PHONE,
    { key: "plate", label: "ทะเบียนรถ", required: true, placeholder: "เช่น 1กข 1234 กรุงเทพฯ (รถเกษตร/โดรนที่ไม่มีทะเบียน ใส่ -)" },
    PROMPTPAY,
  ],
  personal: [
    NAME,
    { key: "vehicle_kind", label: "ประเภทรถ", required: true, options: ["รถยนต์", "รถกระบะ"] },
    { key: "plate", label: "ทะเบียนรถ", required: true, placeholder: "เช่น 1กข 1234 กรุงเทพฯ" },
    PHONE,
    PROMPTPAY,
  ],
  jobseeker: [
    NAME,
    { key: "occupation", label: "อาชีพ", required: true, placeholder: "เช่น ช่างไฟฟ้า แม่บ้าน พนักงานทั่วไป" },
    { key: "skills", label: "ความรู้ความสามารถ", textarea: true, placeholder: "ประสบการณ์ ทักษะ วุฒิการศึกษา" },
    { key: "area", label: "พื้นที่ที่สะดวกทำงาน", placeholder: "เช่น ตำบลบุ่งไหม และใกล้เคียง" },
    PHONE,
  ],
};

/** ลายเซ็นของลิงก์ = SHA256("<secret>|<uid>|<type>") เหมือนที่ n8n คำนวณตอนออกลิงก์ */
export function signupSignature(uid: string, type: string, secret: string): string {
  return crypto.createHash("sha256").update(`${secret}|${uid}|${type}`).digest("hex");
}

export function sameSignature(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** ประเภทรถที่บันทึกใน drivers.vehicle_type — ประเภทเกษตร/มอเตอร์ไซค์ใช้ชื่อเดียวกับใน DB */
export function vehicleTypeOf(type: SignupType, values: Partial<Record<FieldKey, string>>): string {
  if (type === "personal") return values.vehicle_kind === "รถกระบะ" ? "pickup" : "car";
  if (type === "motorcycle") return "motorcycle";
  return type;
}

export const VEHICLE_LABEL: Record<string, string> = {
  motorcycle: "มอเตอร์ไซค์",
  tractor: "รถไถ",
  harvester: "รถเกี่ยวข้าว",
  rice_transplanter: "รถดำนา",
  drone: "โดรน",
  car: "รถยนต์",
  pickup: "รถกระบะ",
};

export type CleanSignup = {
  type: SignupType;
  uid: string;
  sig: string;
  tambon_id: string;
  referrer_first_name: string | null;
  referrer_last_name: string | null;
  values: Partial<Record<FieldKey, string>>;
};

const UID_RE = /^U[0-9a-f]{32}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?\d{9,15}$/;
const MAX_SHORT = 200;
const MAX_LONG = 1000;
const MAX_NAME = 100;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fail = (error: string) => ({ ok: false as const, error });

/** ตรวจข้อมูลที่ส่งมาจากหน้าสมัคร — คืนค่าที่ทำความสะอาดแล้ว หรือข้อความผิดพลาดภาษาไทย */
export function cleanSignup(
  body: Record<string, unknown>
): { ok: true; data: CleanSignup } | { ok: false; error: string } {
  if (!(SIGNUP_TYPES as readonly unknown[]).includes(body.type)) {
    return fail("ลิงก์ใบสมัครไม่ถูกต้อง กรุณากดปุ่มสมัครจากเมนูใน LINE บวรไทยอีกครั้ง");
  }
  const type = body.type as SignupType;
  const uid = text(body.uid);
  const sig = text(body.sig);
  if (!UID_RE.test(uid) || !sig) return fail("ลิงก์ใบสมัครไม่ถูกต้อง กรุณากดปุ่มสมัครจากเมนูใน LINE บวรไทยอีกครั้ง");

  const tambonId = text(body.tambon_id);
  if (!UUID_RE.test(tambonId)) return fail("กรุณาเลือกตำบล");
  if (body.consent !== true) return fail("กรุณายอมรับการเก็บข้อมูลก่อนส่งใบสมัคร");

  const values: CleanSignup["values"] = {};
  for (const f of GROUP_FIELDS[signupGroup(type)]) {
    const v = f.key === "plate" ? text(body[f.key]).replace(/\s+/g, " ") : text(body[f.key]);
    if (f.required && !v) return fail(`กรุณากรอก${f.label}`);
    if (v.length > (f.textarea ? MAX_LONG : MAX_SHORT)) return fail(`${f.label} ยาวเกินไป`);
    if (v && f.key === "phone" && !PHONE_RE.test(v.replace(/[\s-]/g, ""))) return fail("เบอร์โทรไม่ถูกต้อง");
    if (v && f.options && !f.options.includes(v)) return fail(`${f.label} ไม่ถูกต้อง`);
    if (v) values[f.key] = v;
  }

  // ผู้แนะนำไม่บังคับ — ว่างไว้ได้ (ส่วนแบ่งจะเข้าบัญชีกลางขององค์กร)
  const first = text(body.referrer_first_name);
  const last = text(body.referrer_last_name);
  if (first.length > MAX_NAME || last.length > MAX_NAME) return fail("ชื่อผู้แนะนำยาวเกินไป");

  return {
    ok: true,
    data: {
      type,
      uid,
      sig,
      tambon_id: tambonId,
      referrer_first_name: first || null,
      referrer_last_name: last || null,
      values,
    },
  };
}
