"use client";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useLiff } from "@/components/LiffProvider";
import { Button, Card, Field, Textarea } from "@/components/ui";
import { TREE_API, treeReviewParams, type TreeReview } from "@/lib/tree-planting";

/**
 * ปลูกต้นไม้ตำบล: ปุ่มในเมนู LINE เปิดหน้านี้ผ่าน LIFF (liff.line.me/<id>/liff/tree)
 * ประชาชนถ่ายรูป เลือกชนิด ส่งพิกัด → n8n เก็บใน tree_plantings แล้วส่งการ์ดให้ผู้อนุมัติ
 * การ์ดลิงก์กลับมาที่หน้านี้พร้อม ?approve=1&id=&d= เพื่อยืนยันอนุมัติ (n8n ตรวจสิทธิ์ผู้อนุมัติเอง)
 */
const SPECIES = ["ยางพารา", "มะม่วง", "ทุเรียน", "มะพร้าว", "ไม้ยืนต้น", "ไม้ผลอื่นๆ", "อื่นๆ"];
const selectClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-base text-ink outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-tint";

/** ย่อรูปให้ด้านยาวไม่เกิน 1024px เป็น JPEG ส่งใน JSON ได้ (ราว 100–300KB) */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("bad_image"));
    img.src = URL.createObjectURL(file);
  });
}

async function post(path: string, body: object) {
  const r = await fetch(`${TREE_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(String(r.status));
}

export default function TreePlanting() {
  const liff = useLiff();
  const [review, setReview] = useState<TreeReview | null>(null);
  const [photo, setPhoto] = useState("");
  const [species, setSpecies] = useState("");
  const [note, setNote] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function locate() {
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => setGpsError("ยังไม่ได้ตำแหน่ง กรุณาอนุญาตให้ใช้ตำแหน่ง แล้วกดหาตำแหน่งอีกครั้ง"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  useEffect(() => {
    const r = treeReviewParams(window.location.search);
    // อ่าน query ครั้งเดียวตอน mount (หน้านี้ prerender อ่านตอน render ไม่ได้)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the approve link
    setReview(r);
    if (!r) locate();
  }, []);

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await shrink(file));
    } catch {
      setError("อ่านรูปไม่ได้ ลองถ่ายใหม่อีกครั้ง");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const token = liff.getAccessToken();
    if (!token) return setError("กรุณาเปิดหน้านี้จากเมนูในแอป LINE");
    if (!photo) return setError("กรุณาถ่ายหรือเลือกรูปต้นไม้");
    if (!species) return setError("กรุณาเลือกชนิดต้นไม้");
    if (!pos) return setError("ยังไม่ได้ตำแหน่ง กดหาตำแหน่งก่อนส่ง");
    setBusy(true);
    try {
      await post("tree-submit", { token, species, note: note.trim(), lat: pos.lat, lng: pos.lng, photo });
      setDone(true);
    } catch {
      setError("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!review) return;
    setError("");
    const token = liff.getAccessToken();
    if (!token) return setError("กรุณาเปิดลิงก์นี้จากแอป LINE");
    setBusy(true);
    try {
      await post("tree-review", { token, id: review.id, decision: review.decision });
      setDone(true);
    } catch (err) {
      setError(String(err).includes("403") ? "บัญชีนี้ไม่มีสิทธิ์อนุมัติ" : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const heading = <h1 className="mb-4 font-head text-xl font-bold">ปลูกต้นไม้ตำบล</h1>;

  if (liff.status === "loading") return <>{heading}<p>กำลังเปิด…</p></>;
  if (liff.status !== "ready" || !liff.isLoggedIn) {
    return (
      <>
        {heading}
        <Card>
          <p className="mb-4">หน้านี้ต้องเข้าสู่ระบบ LINE เพื่อบอกว่าใครเป็นผู้ปลูก</p>
          {liff.status === "ready" ? (
            <Button onClick={liff.login}>เข้าสู่ระบบด้วย LINE</Button>
          ) : (
            <p className="text-ink-soft">กรุณาเปิดจากเมนู “ปลูกต้นไม้ตำบล” ในแชต LINE บวรไทย</p>
          )}
        </Card>
      </>
    );
  }

  if (done) {
    return (
      <>
        {heading}
        <Card>
          <p className="mb-4">
            {review
              ? review.decision === "approve" ? "บันทึกการอนุมัติแล้ว ระบบแจ้งผู้ปลูกทาง LINE" : "บันทึกการไม่อนุมัติแล้ว ระบบแจ้งผู้ปลูกทาง LINE"
              : "ส่งข้อมูลแล้ว รอผู้ดูแลอนุมัติ ระบบจะแจ้งผลทาง LINE ขอบคุณที่ร่วมปลูกต้นไม้ครับ"}
          </p>
          <Button onClick={liff.closeWindow}>กลับไปที่แชต</Button>
        </Card>
      </>
    );
  }

  if (review) {
    return (
      <>
        {heading}
        <Card>
          <p className="mb-4">
            ยืนยัน{review.decision === "approve" ? "อนุมัติ" : "ไม่อนุมัติ"}รายการ {review.id.slice(0, 8)}
            <br />
            <span className="text-sm text-ink-soft">ตรวจรูปและพิกัดในการ์ดที่แชตก่อนกดยืนยัน</span>
          </p>
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
          <Button onClick={decide} disabled={busy} variant={review.decision === "approve" ? "primary" : "accent"}>
            {busy ? "กำลังบันทึก…" : review.decision === "approve" ? "ยืนยันอนุมัติ" : "ยืนยันไม่อนุมัติ"}
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      {heading}
      <Card>
        <form onSubmit={submit}>
          <Field label="รูปต้นไม้">
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} className="block w-full text-base" />
          </Field>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- พรีวิวรูปจาก data URL ในเครื่อง
            <img src={photo} alt="รูปต้นไม้ที่เลือก" className="mb-3 w-full rounded-xl" />
          )}
          <Field label="ชนิดต้นไม้">
            <select value={species} onChange={(e) => setSpecies(e.target.value)} className={selectClass}>
              <option value="">-- เลือก --</option>
              {SPECIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="หมายเหตุ (ถ้ามี)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="mb-4">
            <span className="mb-2 block font-head text-sm font-medium text-ink-soft">พิกัด</span>
            <p className="mb-2">{pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : gpsError || "กำลังหาตำแหน่ง…"}</p>
            <Button type="button" variant="ghost" onClick={locate}>หาตำแหน่งอีกครั้ง</Button>
          </div>
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "กำลังส่ง…" : "ส่งข้อมูลการปลูก"}
          </Button>
        </form>
      </Card>
    </>
  );
}
