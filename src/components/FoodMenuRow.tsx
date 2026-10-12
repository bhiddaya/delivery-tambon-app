import { Minus, Plus } from "lucide-react";
import { money } from "@/lib/domain";
import { ProductPhoto } from "@/rebuilt/primitives";

type Props = {
  name: string;
  description: string | null;
  photo: string | null;
  price: number;
  quantity: number;
  unavailable: boolean;
  unavailableText: string;
  busy: boolean;
  onAdjust: (delta: number) => void;
};

const round = "flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40";

/** แถวสินค้าแบบ LINE MAN: รูปซ้าย · ชื่อ คำบรรยาย ราคา · ปุ่ม + เขียวมุมขวา กดแล้วกลายเป็น − จำนวน + (แก้ตะกร้าไม่ส่งข้อความเข้าแชต) */
export default function FoodMenuRow({ name, description, photo, price, quantity, unavailable, unavailableText, busy, onAdjust }: Props) {
  return <article className={`flex gap-4 border-b border-[#e7e9e1] py-4 ${unavailable ? "opacity-60" : ""}`}>
    <ProductPhoto src={photo} name={name} className="h-28 w-28 shrink-0 rounded-2xl" />
    <div className="flex min-w-0 flex-1 flex-col">
      <h2 className="line-clamp-2 break-words text-base font-semibold leading-6">{name}</h2>
      {description && <p className="line-clamp-2 break-words text-sm leading-5 text-ink-soft">{description}</p>}
      {unavailable && <p className="mt-1 text-xs text-clay">{unavailableText}</p>}
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <p className="text-lg font-bold">{money(price)}</p>
        {quantity > 0 ? <div className="flex items-center gap-1 rounded-full border border-[#06c755] bg-white">
          <button type="button" disabled={busy} aria-label={`ลด ${name}`} className={`${round} text-[#06a14a]`} onClick={() => onAdjust(-1)}><Minus size={18} aria-hidden="true" /></button>
          <output aria-label={`จำนวน ${name}`} aria-live="polite" className="min-w-6 text-center font-semibold tabular-nums">{quantity}</output>
          <button type="button" disabled={busy || unavailable || quantity >= 99} aria-label={`เพิ่ม ${name}`} className={`${round} text-[#06a14a]`} onClick={() => onAdjust(1)}><Plus size={18} aria-hidden="true" /></button>
        </div> : <button type="button" disabled={busy || unavailable} aria-label={`ใส่ ${name} ลงตะกร้า`} className={`${round} bg-[#06c755] text-white shadow-sm`} onClick={() => onAdjust(1)}><Plus size={22} aria-hidden="true" /></button>}
      </div>
    </div>
  </article>;
}
