"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Package, Bike } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { TYPE_LABEL, VEHICLE_LABEL, DELIVERY_VEHICLES } from "@/lib/domain";
import { lineOaTextLink } from "@/lib/tambon-links";
import { useLiveData } from "./use-live-data";
import { DataState, PageIntro, Panel, inputClass, primaryButton, secondaryButton } from "./primitives";

export default function ServiceRequest({ type }: { type: "parcel" | "ride" }) {
  const { profile } = useSession();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [note, setNote] = useState("");
  const [vehicle, setVehicle] = useState("motorcycle");
  const [review, setReview] = useState(false);
  const loader = useCallback(async () => {
    const result = await createClient().from("tambons").select("name,slug,is_active,intake_blocked").eq("id", profile.tambon_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (result.error) throw new Error("area unavailable");
    return result.data;
  }, [profile.tambon_id]);
  const { data, loading, error, refresh } = useLiveData(loader, "tambons");
  const ready = data?.is_active && !data.intake_blocked && pickup.trim().length >= 5 && dropoff.trim().length >= 5 && !loading && !error;
  const message = [`ตำบล${data?.name ?? ""} #${data?.slug ?? ""}`, `ขอ${TYPE_LABEL[type]}`, `จุดรับ: ${pickup.trim()}`, `จุดส่ง: ${dropoff.trim()}`, type === "ride" ? `ยานพาหนะ: ${VEHICLE_LABEL[vehicle as keyof typeof VEHICLE_LABEL]}` : "", note.trim() ? `หมายเหตุ: ${note.trim()}` : "", "กรุณาตรวจผู้ส่งที่พร้อมรับและยืนยันค่าบริการก่อนสร้างออเดอร์"].filter(Boolean).join("\n");
  function submit(e: FormEvent) { e.preventDefault(); if (ready) setReview(true); }
  return <div><Link href="/customer" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo"><ArrowLeft size={18} aria-hidden="true" />กลับหน้าร้าน</Link><PageIntro title={TYPE_LABEL[type]} description="ระบุจุดรับ จุดส่ง และรายละเอียดให้ครบ ตัวแทนจะตรวจผู้ส่งและยืนยันค่าบริการก่อนรับงาน" /><DataState loading={loading} error={error} retry={refresh} /><div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]"><Panel><form onSubmit={submit} className="space-y-5"><label className="block"><span className="mb-2 block text-sm font-semibold">{type === "ride" ? "จุดขึ้นรถ" : "จุดรับของ"}</span><textarea required minLength={5} maxLength={500} className={`${inputClass} min-h-24 py-3`} value={pickup} onChange={e => { setPickup(e.target.value); setReview(false); }} placeholder="ที่อยู่และจุดสังเกต" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">จุดหมายปลายทาง</span><textarea required minLength={5} maxLength={500} className={`${inputClass} min-h-24 py-3`} value={dropoff} onChange={e => { setDropoff(e.target.value); setReview(false); }} placeholder="ที่อยู่ปลายทางและจุดสังเกต" /></label>{type === "ride" && <label className="block"><span className="mb-2 block text-sm">ยานพาหนะที่ต้องการ</span><select className={inputClass} value={vehicle} onChange={e => { setVehicle(e.target.value); setReview(false); }}>{DELIVERY_VEHICLES.filter(v => v !== "bicycle").map(v => <option key={v} value={v}>{VEHICLE_LABEL[v]}</option>)}</select></label>}<label className="block"><span className="mb-2 block text-sm">{type === "ride" ? "จำนวนผู้โดยสารและสัมภาระ" : "รายละเอียดพัสดุ ขนาด และน้ำหนัก"}</span><textarea className={`${inputClass} min-h-24 py-3`} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setReview(false); }} placeholder={type === "ride" ? "เช่น 1 คน กระเป๋าเล็ก 1 ใบ" : "เช่น กล่องเอกสารขนาด A4 น้ำหนัก 1 กก."} /></label>{review && ready ? <div className="rounded-xl bg-jade-tint p-4"><p className="text-sm leading-7">ตรวจจุดรับและจุดส่งแล้ว เปิด LINE เพื่อตรวจข้อความและกดส่งเอง รายการจะเป็นออเดอร์เมื่อระบบยืนยัน</p><a className={`${primaryButton} mt-4 w-full`} href={lineOaTextLink(message)}><MessageCircle size={18} aria-hidden="true" />เปิด LINE เพื่อยืนยัน</a><button className={`${secondaryButton} mt-3 w-full`} type="button" onClick={() => setReview(false)}>แก้ข้อมูล</button></div> : <button className={`${primaryButton} w-full`} disabled={!ready} type="submit">ตรวจรายละเอียด</button>}{!loading && !error && (!data || !data.is_active || data.intake_blocked) && <p role="status" className="rounded-xl bg-marigold-tint p-4 text-sm leading-7">{!data ? "ยังไม่พบตำบลของบัญชีนี้ โปรดตรวจที่หน้าบัญชี" : "พื้นที่นี้ยังไม่พร้อมรับออเดอร์ใหม่ ติดต่อช่องทางตัวแทนในหน้าชุมชนได้"}</p>}</form></Panel><Panel>{type === "ride" ? <Bike size={32} className="text-indigo" aria-hidden="true" /> : <Package size={32} className="text-indigo" aria-hidden="true" />}<h2 className="mt-4 text-xl font-semibold">ก่อนขอใช้บริการ</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-ink-soft"><li>ระบุจุดรับและปลายทางให้หาเจอ</li><li>แจ้งรายละเอียดที่มีผลต่อยานพาหนะและค่าบริการ</li><li>ยืนยันราคาและวิธีชำระกับตัวแทนก่อนส่งของหรือเดินทาง</li></ul><Link className={`${secondaryButton} mt-5 w-full`} href="/customer/orders">ติดตามออเดอร์ของฉัน</Link></Panel></div></div>;
}
