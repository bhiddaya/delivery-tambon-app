import type { ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, RefreshCw, Utensils } from "lucide-react";

export const primaryButton = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2e3e68] px-5 font-head text-sm font-semibold text-white transition hover:bg-[#1b2547] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-marigold";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-head text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-45";
export const inputClass = "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-ink outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-tint";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-2 text-xs font-semibold tracking-wide text-marigold">{eyebrow}</p>}<h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>{description && <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-soft">{description}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <Panel><p className="text-sm text-ink-soft">{label}</p><p className="mt-2 font-head text-3xl font-semibold tabular-nums text-ink">{value}</p>{note && <p className="mt-2 text-xs leading-6 text-ink-soft">{note}</p>}</Panel>;
}

export function DataState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  if (error) return <Panel className="mb-5"><div role="alert" className="flex items-start gap-3"><AlertCircle className="mt-1 shrink-0 text-clay" /><div><p className="font-semibold">เชื่อมต่อข้อมูลไม่สำเร็จ</p><p className="mt-2 text-sm leading-7 text-ink-soft">ตรวจอินเทอร์เน็ต แล้วลองโหลดข้อมูลล่าสุดอีกครั้ง</p><button type="button" onClick={retry} className={`${secondaryButton} mt-3`}><RefreshCw size={16} aria-hidden="true" />ลองอีกครั้ง</button></div></div></Panel>;
  if (loading) return <div className="mb-6 grid gap-4 sm:grid-cols-3" role="status" aria-label="กำลังโหลดข้อมูล">{[1, 2, 3].map(n => <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-surface-2" />)}</div>;
  return null;
}

export function EmptyPanel({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <Panel className="py-10 text-center"><p className="text-lg font-semibold">{title}</p><p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-ink-soft">{text}</p>{action && <div className="mt-5">{action}</div>}</Panel>;
}

export function ProductPhoto({ src, name, className = "" }: { src: string | null; name: string; className?: string }) {
  const safe = src && /^https:\/\//i.test(src) ? src : null;
  return <div className={`relative overflow-hidden bg-marigold-tint ${className}`}>{safe ? <Image src={safe} alt={name} fill unoptimized sizes="(max-width: 640px) 50vw, 300px" className="object-cover" /> : <div className="flex h-full min-h-24 items-center justify-center text-marigold"><Utensils size={32} aria-hidden="true" /><span className="sr-only">ยังไม่มีรูป {name}</span></div>}</div>;
}
