"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { ImagePlus, Pencil, Plus, RefreshCw, Store, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { money } from "@/lib/domain";
import { resizeImage } from "@/lib/image";
import type { Tables, TablesUpdate } from "@/lib/types";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, ProductPhoto, inputClass, primaryButton, secondaryButton } from "./primitives";

type Draft = { id?: string; name: string; price: string };
export default function MerchantWorkspace() {
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [success, setSuccess] = useState("");
  const [archive, setArchive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shopDraft, setShopDraft] = useState<{ name: string; category: string; address: string } | null>(null);
  const loader = useCallback(async () => {
    const db = createClient();
    const shop = await db.from("merchants").select("*").eq("profile_id", profile.id).maybeSingle();
    if (shop.error) throw new Error("shop unavailable");
    const menu = shop.data ? await db.from("menu_items").select("*").eq("merchant_id", shop.data.id).order("is_hidden").order("name") : { data: [], error: null };
    if (menu.error) throw new Error("menu unavailable");
    return { shop: shop.data, menu: menu.data ?? [] };
  }, [profile.id]);
  const { data, loading, error, refresh } = useLiveData(loader, "merchants,menu_items");
  async function run(action: () => Promise<void>, label = "บันทึกแล้ว") {
    setBusy(true); setErrorText(""); setSuccess("");
    try { await action(); setSuccess(label); refresh(); }
    catch { setErrorText("บันทึกไม่สำเร็จ ตรวจอินเทอร์เน็ตและสิทธิ์ของร้าน แล้วลองอีกครั้ง ข้อมูลที่กรอกยังอยู่"); }
    finally { setBusy(false); }
  }
  async function updateItem(item: Tables<"menu_items">, patch: TablesUpdate<"menu_items">) {
    if (!data?.shop) return;
    await run(async () => {
      const result = await createClient().from("menu_items").update(patch).eq("id", item.id).eq("merchant_id", data.shop!.id).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("not saved");
    });
  }
  async function saveMenu(event: FormEvent) {
    event.preventDefault();
    if (!data?.shop || !draft) return;
    const name = draft.name.trim(); const price = Number(draft.price);
    if (!name || !draft.price.trim() || !Number.isFinite(price) || price < 0 || price > 999999 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) { setErrorText("ใส่ชื่อเมนูและราคา 0–999,999 บาท โดยมีทศนิยมไม่เกิน 2 ตำแหน่ง"); return; }
    await run(async () => {
      const db = createClient();
      const result = draft.id ? await db.from("menu_items").update({ name, price }).eq("id", draft.id).eq("merchant_id", data.shop!.id).select("id") : await db.from("menu_items").insert({ merchant_id: data.shop!.id, name, price }).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("not saved");
      setDraft(null);
    });
  }
  async function saveShop(event: FormEvent) {
    event.preventDefault();
    if (!data?.shop || !shopDraft?.name.trim()) return;
    await run(async () => {
      const result = await createClient().from("merchants").update({ name: shopDraft.name.trim(), category: shopDraft.category.trim() || null, address: shopDraft.address.trim() || null }).eq("id", data.shop!.id).eq("profile_id", profile.id).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("not saved");
      setShopDraft(null);
    });
  }
  async function upload(item: Tables<"menu_items">, file: File) {
    if (!data?.shop) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) { setErrorText("ใช้รูป JPG, PNG หรือ WEBP ขนาดไม่เกิน 10 MB"); return; }
    await run(async () => {
      const db = createClient();
      const image = await resizeImage(file);
      const path = `${data.shop!.id}/${crypto.randomUUID()}.${image.ext}`;
      const upload = await db.storage.from("menu-photos").upload(path, image.blob, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw new Error("upload failed");
      const { data: publicFile } = db.storage.from("menu-photos").getPublicUrl(path);
      const saved = await db.from("menu_items").update({ photo_url: publicFile.publicUrl }).eq("id", item.id).eq("merchant_id", data.shop!.id).select("id");
      if (saved.error || saved.data?.length !== 1) { await db.storage.from("menu-photos").remove([path]); throw new Error("photo not saved"); }
    }, "อัปเดตรูปเมนูแล้ว");
  }
  const visible = data?.menu.filter(m => m.is_hidden === archive) ?? [];
  return <div>
    <PageIntro eyebrow="ร้านของคุณ ในชุมชนของเรา" title="จัดการร้านและเมนู" description="แก้ข้อมูลร้าน เตรียมเมนู เปลี่ยนราคา และแจ้งรายการที่หมดได้จากหน้านี้" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    {!profile.approved && <Panel className="mb-5 border-marigold bg-marigold-tint"><p className="font-semibold">กำลังรอตัวแทนอนุมัติร้าน</p><p className="mt-2 text-sm leading-7">เตรียมข้อมูลร้านและเมนูได้ แต่ยังเปิดรับรายการไม่ได้จนกว่าจะได้รับอนุมัติ</p></Panel>}
    {!profile.line_user_id && <p className="mb-5 text-sm leading-7 text-ink-soft">ผูก LINE เพื่อรับแจ้งออเดอร์ใหม่ <Link className="font-semibold text-indigo underline" href="/account">ไปหน้าบัญชี</Link></p>}
    <DataState loading={loading} error={error} retry={refresh} />
    <div aria-live="polite">{errorText && <p role="alert" className="mb-5 rounded-xl bg-clay-tint p-4 text-sm leading-7 text-clay">{errorText}</p>}{success && <p role="status" className="mb-5 rounded-xl bg-jade-tint p-4 text-sm text-jade">{success}</p>}</div>
    {data && !error && (data.shop ? <>
      <Panel className="mb-6"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="rounded-2xl bg-indigo-tint p-4 text-indigo"><Store size={25} aria-hidden="true" /></span><div><h2 className="text-xl font-semibold">{data.shop.name}</h2><p className="mt-2 text-sm text-ink-soft">{data.shop.category || "ยังไม่ระบุประเภทร้าน"}</p><p className="mt-1 text-xs leading-6 text-ink-soft">{data.shop.address || "ยังไม่ระบุที่อยู่"}</p></div></div><div className="flex flex-wrap gap-3"><button className={secondaryButton} disabled={busy} onClick={() => setShopDraft({ name: data.shop!.name, category: data.shop!.category ?? "", address: data.shop!.address ?? "" })}><Pencil size={16} aria-hidden="true" />แก้ข้อมูลร้าน</button><button className={data.shop.is_open ? primaryButton : secondaryButton} aria-pressed={data.shop.is_open} disabled={busy || !profile.approved || Boolean(profile.suspended_at)} onClick={() => run(async () => { const result = await createClient().from("merchants").update({ is_open: !data.shop!.is_open }).eq("id", data.shop!.id).eq("profile_id", profile.id).select("id"); if (result.error || result.data?.length !== 1) throw new Error("not saved"); })}>{data.shop.is_open ? "เปิดขายอยู่ · กดปิดร้าน" : "ปิดร้านอยู่ · กดเปิดขาย"}</button></div></div>
      {shopDraft && <form onSubmit={saveShop} className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2"><label><span className="mb-2 block text-sm">ชื่อร้าน</span><input className={inputClass} required maxLength={150} value={shopDraft.name} onChange={e => setShopDraft({ ...shopDraft, name: e.target.value })} /></label><label><span className="mb-2 block text-sm">ประเภทสินค้า</span><input className={inputClass} maxLength={200} value={shopDraft.category} onChange={e => setShopDraft({ ...shopDraft, category: e.target.value })} /></label><label className="sm:col-span-2"><span className="mb-2 block text-sm">ที่อยู่และจุดสังเกต</span><input className={inputClass} maxLength={500} value={shopDraft.address} onChange={e => setShopDraft({ ...shopDraft, address: e.target.value })} /></label><div className="flex gap-3"><button className={primaryButton} disabled={busy} type="submit">{busy ? "กำลังบันทึก…" : "บันทึกข้อมูลร้าน"}</button><button className={secondaryButton} disabled={busy} type="button" onClick={() => setShopDraft(null)}>ยกเลิก</button></div></form>}
      </Panel>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div className="flex gap-2" role="group" aria-label="ชุดเมนู"><button className={archive ? secondaryButton : primaryButton} aria-pressed={!archive} onClick={() => setArchive(false)}>เมนูในร้าน ({data.menu.filter(m => !m.is_hidden).length})</button><button className={archive ? primaryButton : secondaryButton} aria-pressed={archive} onClick={() => setArchive(true)}>พักขาย ({data.menu.filter(m => m.is_hidden).length})</button></div><button className={primaryButton} disabled={busy} onClick={() => setDraft({ name: "", price: "" })}><Plus size={18} aria-hidden="true" />เพิ่มเมนู</button></div>
      {draft && <Panel className="mb-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{draft.id ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}</h2><button aria-label="ปิดฟอร์มเมนู" className="flex h-11 w-11 items-center justify-center" disabled={busy} onClick={() => setDraft(null)}><X size={20} /></button></div><form className="grid gap-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={saveMenu}><label><span className="mb-2 block text-sm">ชื่อเมนู</span><input className={inputClass} autoFocus required maxLength={150} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label><span className="mb-2 block text-sm">ราคา (บาท)</span><input className={inputClass} type="number" inputMode="decimal" required min="0" max="999999" step="0.01" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} /></label><button type="submit" className={`${primaryButton} self-end`} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกเมนู"}</button></form></Panel>}
      {visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-surface"><ProductPhoto src={item.photo_url} name={item.name} className="aspect-[16/10]" /><div className="p-5"><h3 className="text-lg font-semibold">{item.name}</h3><p className="mt-2 text-xl font-semibold text-indigo">{money(Number(item.price))}</p><div className="mt-4 flex flex-wrap gap-2"><button className={secondaryButton} disabled={busy} onClick={() => setDraft({ id: item.id, name: item.name, price: String(item.price) })}><Pencil size={15} aria-hidden="true" />แก้ไข</button><label className={`${secondaryButton} ${busy ? "opacity-45" : "cursor-pointer"}`}><ImagePlus size={16} aria-hidden="true" />เปลี่ยนรูป<input className="sr-only" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(item, file); }} /></label></div><div className="mt-3 flex flex-wrap gap-2">{!archive && <button className={`${secondaryButton} flex-1 ${item.is_available ? "text-jade" : "text-clay"}`} disabled={busy} aria-pressed={item.is_available} onClick={() => updateItem(item, { is_available: !item.is_available })}>{item.is_available ? "พร้อมขาย · กดแจ้งหมด" : "หมด · กดเปิดขาย"}</button>}<button className={secondaryButton} disabled={busy} onClick={() => updateItem(item, { is_hidden: !item.is_hidden })}>{archive ? "นำกลับมาขาย" : "พักขาย"}</button></div></div></article>)}</div> : <EmptyPanel title={archive ? "ยังไม่มีเมนูที่พักขาย" : "ร้านยังไม่มีเมนู"} text={archive ? "เมนูที่พักขายยังเก็บประวัติออเดอร์ไว้ และนำกลับมาขายได้" : "เพิ่มชื่อ ราคา และรูปจริงของสินค้า เพื่อให้ลูกค้าเลือกได้ง่าย"} />}
    </> : <EmptyPanel title="ยังไม่พบข้อมูลร้านของบัญชีนี้" text="ตรวจบทบาทและข้อมูลสมัครร้านที่หน้าบัญชี หรือติดต่อตัวแทนตำบล" action={<Link href="/account" className={secondaryButton}>ตรวจบัญชีร้าน</Link>} />)}
  </div>;
}
