"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Button, Card, Field, Input } from "@/components/ui";
import { money } from "@/lib/domain";
import { resizeImage } from "@/lib/image";
import type { Tables } from "@/lib/types";

export default function MerchantHomePage() {
  const { profile } = useSession();
  const [merchant, setMerchant] = useState<Tables<"merchants"> | null>(null);
  const [menu, setMenu] = useState<Tables<"menu_items">[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [busy, setBusy] = useState(false);

  // เมนูที่กำลังแก้อยู่ — เก็บค่าที่พิมพ์ไว้ต่างหาก ไม่แก้ทับ menu ตรง ๆ
  // เพื่อให้กด "ยกเลิก" แล้วกลับไปค่าเดิมได้ โดยไม่ต้องโหลดใหม่จากเซิร์ฟเวอร์
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // รูปที่กำลังอัป — เก็บเป็น id ของเมนู เพื่อขึ้นสถานะเฉพาะแถวนั้น
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data: m } = await supabase.from("merchants").select("*").eq("profile_id", profile.id).maybeSingle();
    setMerchant(m ?? null);
    if (m) {
      const { data: items } = await supabase
        .from("menu_items")
        .select("*")
        .eq("merchant_id", m.id)
        .order("created_at");
      setMenu(items ?? []);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  if (!profile.approved) {
    return (
      <Card>
        <p className="font-head font-semibold mb-1">รอการอนุมัติจากแอดมิน</p>
        <p className="text-ink-soft text-sm">
          ร้านของคุณอยู่ระหว่างรอแอดมินตรวจสอบ ระหว่างนี้เพิ่มเมนูเตรียมไว้ได้เลย ลูกค้าจะยังไม่เห็นร้านจนกว่าจะได้รับการอนุมัติ
        </p>
      </Card>
    );
  }

  if (!merchant) return <p className="text-ink-soft text-sm">กำลังโหลด...</p>;

  async function toggleOpen() {
    if (!merchant) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("merchants").update({ is_open: !merchant.is_open }).eq("id", merchant.id);
    setBusy(false);
    load();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant || !newName || !newPrice) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("menu_items").insert({
      merchant_id: merchant.id,
      name: newName,
      price: Number(newPrice),
    });
    setNewName("");
    setNewPrice("");
    setBusy(false);
    load();
  }

  /**
   * เลิกขายเมนู — ซ่อนแทนการลบ
   *
   * ลบตรง ๆ ไม่ได้ถ้าเมนูนั้นเคยมีคนสั่ง เพราะ order_items อ้างถึงอยู่
   * (ตั้งใจกันไว้ ไม่งั้นประวัติการขายจะหายไปพร้อมเมนู) การซ่อนจึงเป็น
   * ค่าตั้งต้น — ได้ผลที่ร้านต้องการจริง ๆ คือเมนูพ้นสายตาลูกค้าและพ้น
   * รายการหลักของร้าน โดยไม่แตะประวัติ
   */
  async function setHidden(item: Tables<"menu_items">, hidden: boolean) {
    setBusy(true);
    setMenuError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .update({ is_hidden: hidden })
      .eq("id", item.id)
      .select("id");
    setBusy(false);

    if (error) {
      setMenuError(`ไม่สำเร็จ: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setMenuError("ไม่สำเร็จ — ไม่มีสิทธิ์แก้เมนูนี้ หรือเมนูถูกลบไปแล้ว");
      return;
    }
    load();
  }

  /**
   * ลบถาวร — ใช้ได้เฉพาะเมนูที่ยังไม่เคยมีใครสั่ง เช่นพิมพ์ผิดแล้วอยากลบทิ้ง
   *
   * ไม่ถามฐานข้อมูลก่อนว่า "เคยถูกสั่งไหม" แต่ลองลบแล้วอ่าน error เอา
   * เพราะคำตอบที่ถูกต้องที่สุดคือคำตอบของฐานข้อมูลเองตอนนั้น การถามก่อน
   * แล้วค่อยลบเปิดช่องให้สถานะเปลี่ยนระหว่างสองคำสั่ง
   */
  async function deleteForever(item: Tables<"menu_items">) {
    setBusy(true);
    setMenuError(null);
    const supabase = createClient();
    const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
    setBusy(false);

    if (error) {
      // 23503 = foreign key violation — แปลว่าเมนูนี้เคยถูกสั่งไปแล้ว
      setMenuError(
        error.code === "23503"
          ? `ลบ "${item.name}" ถาวรไม่ได้ เพราะเคยมีลูกค้าสั่งไปแล้ว — เก็บไว้เป็นประวัติการขาย ซ่อนไว้อย่างนี้พอครับ`
          : `ลบไม่สำเร็จ: ${error.message}`
      );
      return;
    }
    load();
  }

  async function toggleAvailable(item: Tables<"menu_items">) {
    const supabase = createClient();
    await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id);
    load();
  }

  /**
   * อัปรูปเมนู
   *
   * path ต้องเป็น <merchant_id>/<ชื่อไฟล์> เพราะ policy ที่ storage ตรวจว่า
   * โฟลเดอร์ชั้นแรกเป็นร้านของผู้เรียกจริงไหม ส่งชื่ออื่นมาจะถูกปฏิเสธ
   *
   * ตั้งชื่อไฟล์ใหม่ทุกครั้งด้วย uuid แทนการเขียนทับชื่อเดิม เพราะรูปที่ทับ
   * ชื่อเดิมจะติด cache ของเบราว์เซอร์และ CDN ร้านจะเปลี่ยนรูปแล้วยังเห็นรูปเก่า
   * แล้วนึกว่าอัปไม่สำเร็จ
   */
  async function uploadPhoto(item: Tables<"menu_items">, file: File) {
    if (!merchant) return;
    setPhotoError(null);
    setUploadingId(item.id);

    try {
      const { blob, ext } = await resizeImage(file);
      const path = `${merchant.id}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();

      const { error: upErr } = await supabase.storage
        .from("menu-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw new Error(upErr.message);

      const { data: pub } = supabase.storage.from("menu-photos").getPublicUrl(path);

      const { data: saved, error: dbErr } = await supabase
        .from("menu_items")
        .update({ photo_url: pub.publicUrl })
        .eq("id", item.id)
        .select("id");
      if (dbErr) throw new Error(dbErr.message);
      if (!saved || saved.length === 0) throw new Error("บันทึกรูปกับเมนูไม่สำเร็จ");

      // ลบรูปเก่าทิ้ง ไม่ให้กินที่เก็บไปเรื่อย ๆ ทุกครั้งที่เปลี่ยนรูป
      // ทำหลังบันทึกสำเร็จเท่านั้น และถ้าลบไม่ได้ก็ไม่ถือว่าล้มเหลว
      const oldPath = item.photo_url?.split("/menu-photos/")[1];
      if (oldPath) await supabase.storage.from("menu-photos").remove([oldPath]);

      load();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingId(null);
    }
  }

  function startEdit(item: Tables<"menu_items">) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(String(Number(item.price)));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  /**
   * บันทึกชื่อ/ราคาใหม่ของเมนู
   *
   * แก้ราคาย้อนหลังไม่ทำให้ประวัติเพี้ยน เพราะ order_items เก็บชื่อกับราคา
   * ไว้เป็นสำเนาของตัวเองตั้งแต่ตอนสั่ง ออเดอร์เก่าจึงยังแสดงราคาที่ลูกค้า
   * จ่ายจริง ไม่ใช่ราคาวันนี้ — ถ้าวันหน้าเปลี่ยนให้ไปดึงราคาจากเมนูแทน
   * การแก้ราคาจะกลายเป็นการแก้บิลย้อนหลังทันที
   */
  async function saveEdit(id: string) {
    const name = editName.trim();
    const price = Number(editPrice);

    if (!name) {
      setEditError("กรุณาใส่ชื่อเมนู");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setEditError("ราคาต้องเป็นตัวเลขและไม่ติดลบ");
      return;
    }

    setBusy(true);
    setEditError(null);
    const supabase = createClient();

    // ตรวจ error และนับแถวที่เขียนได้จริง — update ที่ไม่โดนแถวไหนเลย
    // ไม่ถือเป็น error ใน PostgREST ถ้าดูแค่ error จะได้ปุ่มที่กดแล้วเงียบ
    const { data: updated, error } = await supabase
      .from("menu_items")
      .update({ name, price })
      .eq("id", id)
      .select("id");
    setBusy(false);

    if (error) {
      setEditError(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    if (!updated || updated.length === 0) {
      setEditError("บันทึกไม่สำเร็จ — ไม่มีสิทธิ์แก้เมนูนี้ หรือเมนูถูกลบไปแล้ว");
      return;
    }

    setEditingId(null);
    load();
  }

  const activeMenu = menu.filter((it) => !it.is_hidden);
  const hiddenMenu = menu.filter((it) => it.is_hidden);

  return (
    <div>
      <Card className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{merchant.name}</h1>
          <p className="text-ink-soft text-sm">{merchant.category}</p>
        </div>
        <Button variant={merchant.is_open ? "primary" : "secondary"} onClick={toggleOpen} disabled={busy}>
          {merchant.is_open ? "เปิดร้าน" : "ปิดร้าน"}
        </Button>
      </Card>

      <h2 className="font-head font-semibold text-sm mb-2">เมนู</h2>
      {photoError && <p className="text-clay text-sm mb-2">{photoError}</p>}
      {menuError && <p className="text-clay text-sm mb-2">{menuError}</p>}
      <Card className="!p-0 divide-y divide-border mb-4">
        {activeMenu.map((it) =>
          editingId === it.id ? (
            <div key={it.id} className="px-4 py-3">
              <Field label="ชื่อเมนู">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="เช่น ผัดกะเพราหมู"
                />
              </Field>
              <Field label="ราคา">
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="45"
                />
              </Field>
              {editError && <p className="text-clay text-sm mb-3">{editError}</p>}
              <div className="flex gap-2">
                <Button onClick={() => saveEdit(it.id)} disabled={busy} className="flex-1">
                  {busy ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
                <Button variant="secondary" onClick={cancelEdit} disabled={busy}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3">
              {/* แตะรูปเพื่อเปลี่ยนรูป — label ครอบ input ที่ซ่อนไว้
                  เพราะ input[type=file] จัดสไตล์ให้สวยตรง ๆ ไม่ได้ */}
              <label className="relative shrink-0 cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploadingId !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
                    if (f) uploadPhoto(it, f);
                  }}
                />
                {it.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage ไม่ได้ตั้ง loader ไว้
                  <img
                    src={it.photo_url}
                    alt={it.name}
                    className="h-14 w-14 rounded-lg object-cover bg-surface-2"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-ink-soft text-center leading-tight">
                    เพิ่ม<br />รูป
                  </span>
                )}
                {uploadingId === it.id && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink/60 text-[10px] font-head font-semibold text-white">
                    กำลังอัป
                  </span>
                )}
              </label>

              {/* กดที่ชื่อ/ราคาเพื่อแก้ — ปุ่มแก้แยกอีกปุ่มจะเบียดจนกดยากบนมือถือ */}
              <button
                onClick={() => startEdit(it)}
                className="flex-1 text-left"
                aria-label={`แก้ไข ${it.name}`}
              >
                <div className="font-semibold text-sm">{it.name}</div>
                <div className="text-ink-soft text-xs">
                  {money(Number(it.price))} · <span className="text-indigo">แตะเพื่อแก้</span>
                </div>
              </button>
              <button
                onClick={() => toggleAvailable(it)}
                className={`text-xs font-head font-semibold rounded-full px-2.5 py-1 ${
                  it.is_available ? "bg-jade-tint text-jade" : "bg-surface-2 text-ink-soft"
                }`}
              >
                {it.is_available ? "พร้อมขาย" : "หมด"}
              </button>
              <button
                onClick={() => setHidden(it, true)}
                disabled={busy}
                className="text-clay text-xs font-head font-semibold disabled:opacity-40"
              >
                เลิกขาย
              </button>
            </div>
          )
        )}
        {activeMenu.length === 0 && (
          <p className="p-4 text-ink-soft text-sm">ยังไม่มีเมนู เพิ่มด้านล่างได้เลย</p>
        )}
      </Card>

      <Card>
        <form onSubmit={addItem} className="flex gap-2 items-end">
          <Field label="ชื่อเมนู">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น ผัดกะเพราหมู" />
          </Field>
          <Field label="ราคา">
            <Input
              type="number"
              min={0}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="45"
            />
          </Field>
          <Button type="submit" disabled={busy} className="mb-3">
            เพิ่ม
          </Button>
        </form>
      </Card>

      {/* เมนูที่เลิกขายแล้ว — ไว้ท้ายสุดและสีจาง เพราะไม่ใช่ของที่ต้องดูทุกวัน
          แต่ต้องยังหาเจอ ไม่งั้นร้านที่กดผิดจะเอากลับมาไม่ได้ */}
      {hiddenMenu.length > 0 && (
        <>
          <h2 className="font-head font-semibold text-sm mb-2 mt-6 text-ink-soft">
            เลิกขายแล้ว ({hiddenMenu.length})
          </h2>
          <Card className="!p-0 divide-y divide-border">
            {hiddenMenu.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate line-through">{it.name}</div>
                  <div className="text-ink-soft text-xs">{money(Number(it.price))}</div>
                </div>
                <button
                  onClick={() => setHidden(it, false)}
                  disabled={busy}
                  className="text-indigo text-xs font-head font-semibold disabled:opacity-40"
                >
                  กลับมาขาย
                </button>
                <button
                  onClick={() => deleteForever(it)}
                  disabled={busy}
                  className="text-clay text-xs font-head font-semibold disabled:opacity-40"
                >
                  ลบถาวร
                </button>
              </div>
            ))}
          </Card>
          <p className="text-ink-soft text-xs mt-2">
            เมนูที่เคยมีลูกค้าสั่งไปแล้วจะลบถาวรไม่ได้ เพราะต้องเก็บไว้เป็นประวัติการขาย
            ซ่อนไว้อย่างนี้ลูกค้าก็ไม่เห็นแล้ว
          </p>
        </>
      )}
    </div>
  );
}
