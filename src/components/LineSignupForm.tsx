"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import {
  GROUP_FIELDS,
  SIGNUP_LABEL,
  SIGNUP_TYPES,
  signupGroup,
  type FieldDef,
  type SignupType,
} from "@/lib/line-signup";

type Tambon = { id: string; label: string };

const PRIVACY =
  "ข้อมูลของท่านใช้เพื่อให้บริการในตำบลเท่านั้น ไม่เปิดเผยต่อสาธารณะ ไม่ขายหรือส่งต่อบุคคลภายนอก ขอดู แก้ไข หรือลบข้อมูลได้ทุกเมื่อโดยทักแชต LINE บวรไทย";

const SELECT_CLASS = "min-h-12 w-full rounded-xl border border-border bg-surface px-3";

/** หน้าใบสมัครที่ LINE OA เปิดให้ — type/uid/sig มาจากลิงก์ที่ปุ่มใน LINE สร้างไว้ */
export default function LineSignupForm({ type, uid, sig }: { type: string; uid: string; sig: string }) {
  const valid = (SIGNUP_TYPES as readonly string[]).includes(type) && uid !== "" && sig !== "";
  const signupType = valid ? (type as SignupType) : null;
  const group = signupType ? signupGroup(signupType) : null;

  const [tambons, setTambons] = useState<Tambon[]>([]);
  const [tambonId, setTambonId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [refFirst, setRefFirst] = useState("");
  const [refLast, setRefLast] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"signup" | "jobseeker" | null>(null);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    fetch("/api/line/signup")
      .then(r => r.json() as Promise<{ tambons?: Tambon[]; error?: string }>)
      .then(data => {
        if (!live) return;
        if (data.error) {
          setError("โหลดรายชื่อตำบลไม่ได้ กรุณาเปิดหน้านี้ใหม่");
          return;
        }
        setTambons(data.tambons ?? []);
      })
      .catch(() => {
        if (live) setError("โหลดรายชื่อตำบลไม่ได้ กรุณาเปิดหน้านี้ใหม่");
      });
    return () => {
      live = false;
    };
  }, [valid]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signupType) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/line/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          type: signupType,
          uid,
          sig,
          tambon_id: tambonId,
          referrer_first_name: refFirst,
          referrer_last_name: refLast,
          consent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; jobseeker?: boolean };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "ส่งใบสมัครไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      setDone(data.jobseeker ? "jobseeker" : "signup");
    } catch {
      setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (!signupType || !group) {
    return (
      <Frame>
        <Card>
          <p role="alert" className="text-sm leading-7">
            ลิงก์ใบสมัครไม่ถูกต้อง กรุณากดปุ่มสมัครจากเมนูใน LINE บวรไทยอีกครั้ง
          </p>
        </Card>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">
            {done === "jobseeker" ? "บันทึกใบสมัครงานแล้ว" : "ได้รับใบสมัครแล้ว"}
          </h2>
          <p className="text-sm leading-7 text-ink-soft">
            {done === "jobseeker"
              ? "ทีมงานจะช่วยจับคู่กับผู้ที่ต้องการจ้างงานในพื้นที่"
              : "ทีมงานจะตรวจสอบและอนุมัติภายใน 1-2 วันทำการ เมื่ออนุมัติแล้วจะแจ้งทาง LINE บวรไทย"}{" "}
            ปิดหน้านี้แล้วกลับไปที่แชตได้เลยครับ
          </p>
        </Card>
      </Frame>
    );
  }

  const showReferrer = group !== "jobseeker";

  return (
    <Frame>
      <div className="mb-4">
        <h1 className="mb-1 text-2xl font-semibold">ใบสมัคร บวรไทย</h1>
        <p className="text-sm font-semibold text-indigo">{SIGNUP_LABEL[signupType]}</p>
        <p className="mt-2 text-sm leading-7 text-ink-soft">{PRIVACY}</p>
      </div>
      <Card>
        <form onSubmit={submit}>
          <Field label="ตำบล/แขวงของท่าน">
            <select required className={SELECT_CLASS} value={tambonId} onChange={e => setTambonId(e.target.value)}>
              <option value="">เลือกตำบล/แขวง</option>
              {tambons.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          {GROUP_FIELDS[group].map(f => (
            <Field key={f.key} label={f.label}>
              {renderField(f, values[f.key] ?? "", v => setValues(prev => ({ ...prev, [f.key]: v })))}
            </Field>
          ))}

          {showReferrer && (
            <div className="mb-4 rounded-xl bg-surface-2 p-4">
              <p className="mb-1 font-head text-sm font-semibold">ผู้แนะนำ (ปกติควรกรอก)</p>
              <p className="mb-3 text-xs leading-6 text-ink-soft">
                ถ้าไม่มีผู้แนะนำ ให้เว้นว่างไว้ ส่วนแบ่งจะเข้าบัญชีกลางขององค์กร
              </p>
              <Field label="ชื่อผู้แนะนำ">
                <Input maxLength={100} value={refFirst} onChange={e => setRefFirst(e.target.value)} />
              </Field>
              <Field label="นามสกุลผู้แนะนำ">
                <Input maxLength={100} value={refLast} onChange={e => setRefLast(e.target.value)} />
              </Field>
              <div className="text-xs leading-6 text-ink-soft">
                <p className="font-semibold">หมายเหตุ: สัดส่วนประโยชน์ของผู้แนะนำ</p>
                <ul className="list-disc pl-5">
                  <li>ผู้แนะนำผู้ให้บริการ (ร้านค้า โรงแรม ผู้ผลิต ฯลฯ) ได้รับ 30% ของยอดรายได้หลังหักค่าใช้จ่าย ต่อเดือน</li>
                  <li>ผู้แนะนำลูกค้า (ผู้มาซื้อสินค้า/บริการในระบบ) ได้รับ 40% ของยอดรายได้ในแต่ละครั้งที่ซื้อ</li>
                  <li>อีก 30% ที่เหลือ นำมาสนับสนุน บวร ทั่วประเทศ</li>
                </ul>
              </div>
            </div>
          )}

          <label className="mb-4 flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              required
              className="mt-1.5 h-5 w-5 shrink-0"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            <span>ข้าพเจ้ายินยอมให้เก็บข้อมูลเพื่อการสมัครและให้บริการนี้</span>
          </label>

          {error && (
            <p role="alert" className="mb-3 text-sm text-clay">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy || !tambonId || !consent}>
            {busy ? "กำลังส่ง…" : "ส่งใบสมัคร"}
          </Button>
        </form>
      </Card>
    </Frame>
  );
}

function renderField(f: FieldDef, value: string, onChange: (v: string) => void) {
  const required = f.required === true;
  if (f.options) {
    return (
      <select required={required} className={SELECT_CLASS} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">เลือก</option>
        {f.options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.textarea) {
    return (
      <Textarea
        required={required}
        rows={3}
        maxLength={1000}
        placeholder={f.placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  }
  const isPhone = f.key === "phone";
  return (
    <Input
      required={required}
      type={isPhone ? "tel" : "text"}
      inputMode={isPhone ? "tel" : undefined}
      maxLength={200}
      placeholder={f.placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-6">{children}</div>;
}
