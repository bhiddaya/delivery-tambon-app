import { Minus, Plus } from "lucide-react";
import { money } from "@/lib/domain";
import { ProductPhoto } from "@/rebuilt/primitives";

type Props = {
  name: string;
  photo: string | null;
  price: number;
  quantity: number;
  unavailable: boolean;
  unavailableText: string;
  busy: boolean;
  onSelect: (selected: boolean) => void;
  onAdjust: (delta: number) => void;
};

/** Selection feedback stays on the menu; cart edits never send chat messages. */
export default function FoodMenuRow({ name, photo, price, quantity, unavailable, unavailableText, busy, onSelect, onAdjust }: Props) {
  const selected = quantity > 0;
  return <article className={`flex items-start gap-3 rounded-2xl border p-3 ${selected ? "border-jade bg-jade-tint" : "border-border bg-surface"}`}>
    <ProductPhoto src={photo} name={name} className="h-20 w-20 shrink-0 rounded-xl" />
    <div className="min-w-0 flex-1">
      <h2 className="break-words text-sm font-semibold leading-6">{name}</h2>
      <p className="mt-1 font-semibold text-indigo">{money(price)}</p>
      {unavailable && <p className="mt-1 text-xs text-clay">{unavailableText}</p>}
      {selected && <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" disabled={busy} aria-label={`ลด ${name}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface disabled:opacity-40" onClick={() => onAdjust(-1)}><Minus size={18} aria-hidden="true" /></button>
        <output aria-label={`จำนวน ${name}`} aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums">{quantity}</output>
        <button type="button" disabled={busy || unavailable || quantity >= 99} aria-label={`เพิ่ม ${name}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface disabled:opacity-40" onClick={() => onAdjust(1)}><Plus size={18} aria-hidden="true" /></button>
      </div>}
    </div>
    <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer flex-col items-center gap-1 py-2 text-xs">
      <input type="checkbox" checked={selected} disabled={busy || (!selected && unavailable)} onChange={e => onSelect(e.target.checked)} aria-label={`เลือก ${name}`} className="h-6 w-6 cursor-pointer accent-[#28734f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo disabled:cursor-not-allowed" />
      <span aria-hidden="true" className={selected ? "font-semibold text-jade" : "text-ink-soft"}>{selected ? "เลือกแล้ว" : "เลือก"}</span>
    </label>
  </article>;
}
