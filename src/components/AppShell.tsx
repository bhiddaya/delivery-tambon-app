"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LayoutDashboard, Store, Bike, ClipboardList, Wallet, Settings, UserRound, LogOut, ShoppingBag, CheckCircle2, Newspaper, MapPin, X, Menu, WifiOff } from "lucide-react";
import InstallPwa from "@/components/InstallPwa";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { homePathFor, ROLE_LABEL, type UserRole } from "@/lib/domain";

const customer = [{ href: "/customer", label: "ค้นหาร้านค้า", icon: Store }, { href: "/customer/orders", label: "ออเดอร์ของฉัน", icon: ClipboardList }, { href: "/account", label: "บัญชีของฉัน", icon: UserRound }];
const merchant = [{ href: "/merchant/orders", label: "ออเดอร์เข้าร้าน", icon: ClipboardList }, { href: "/merchant", label: "ร้านและเมนู", icon: Store }, { href: "/merchant/earnings", label: "รายรับ", icon: Wallet }, { href: "/account", label: "บัญชีของฉัน", icon: UserRound }];
const driver = [{ href: "/driver", label: "งานจัดส่ง", icon: Bike }, { href: "/driver/earnings", label: "รายรับ", icon: Wallet }, { href: "/account", label: "บัญชีของฉัน", icon: UserRound }];
const admin = [{ href: "/admin", label: "ภาพรวมวันนี้", icon: LayoutDashboard }, { href: "/admin/orders", label: "จัดการออเดอร์", icon: ClipboardList }, { href: "/admin/people", label: "ร้านค้าและไรเดอร์", icon: Store }, { href: "/admin/approvals", label: "อนุมัติสมาชิก", icon: CheckCircle2 }, { href: "/admin/accounts", label: "บัญชีตำบล", icon: Wallet }, { href: "/admin/board", label: "ประกาศและเรื่องร้องเรียน", icon: Newspaper }, { href: "/admin/tambon-page", label: "ข้อมูลหน้าตำบล", icon: MapPin }, { href: "/admin/settings", label: "ตั้งค่าตำบล", icon: Settings }, { href: "/account", label: "บัญชีของฉัน", icon: UserRound }];
const NAV = { customer, merchant, driver, admin, superadmin: admin };
function onlineSubscribe(callback: () => void) { window.addEventListener("online", callback); window.addEventListener("offline", callback); return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); }; }

export default function AppShell({ role, children }: { role: UserRole; children: ReactNode }) {
  const { profile } = useSession();
  const effectiveRole = profile.role === "superadmin" ? "superadmin" : role;
  const pathname = usePathname();
  const router = useRouter();
  const links = NAV[effectiveRole];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = menuDialog.current;
    if (menuOpen && dialog && !dialog.open) dialog.showModal();
    else if (!menuOpen && dialog?.open) dialog.close();
  }, [menuOpen]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const online = useSyncExternalStore(onlineSubscribe, () => navigator.onLine, () => true);
  const mobileLinks = links.slice(0, (effectiveRole === "admin" || effectiveRole === "superadmin") ? 3 : 4);
  async function signOut() {
    setBusy(true); setError("");
    try { const result = await createClient().auth.signOut(); if (result.error) { setError("ออกจากระบบไม่สำเร็จ ลองอีกครั้ง"); return; } router.push("/delivery"); router.refresh(); }
    catch { setError("ออกจากระบบไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setBusy(false); }
  }
  function navItems() {
    return links.map(link => { const active = pathname === link.href || (link.href === homePathFor(effectiveRole) && pathname.startsWith(`${link.href}/merchants/`)); return <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition ${active ? "bg-indigo-tint text-indigo" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}><link.icon size={20} aria-hidden="true" />{link.label}</Link>; });
  }
  return <div className="min-h-dvh bg-paper text-ink">
    <a href="#app-main" className="sr-only z-50 bg-surface p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">ข้ามไปเนื้อหา</a>
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface p-5 lg:flex">
      <Link href="/app" className="mb-8 flex items-center gap-3 px-3 py-2"><span className="rounded-2xl bg-[#2e3e68] p-2.5 text-white"><ShoppingBag size={25} aria-hidden="true" /></span><span><span className="block font-display text-xl text-indigo">บวรไทย</span><span className="text-[11px] tracking-widest text-ink-soft">DELIVERY • ใกล้บ้าน</span></span></Link>
      <p className="mb-3 px-4 text-xs font-semibold text-ink-soft">พื้นที่ของ{ROLE_LABEL[effectiveRole]}</p><nav aria-label="เมนูแอป" className="space-y-1">{navItems()}</nav>
      <div className="mt-auto border-t border-border pt-5"><Link href="/delivery" className="flex min-h-11 items-center gap-3 px-4 text-sm text-ink-soft"><MapPin size={18} aria-hidden="true" />ดูพื้นที่บริการ</Link><button type="button" onClick={signOut} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-sm text-ink-soft hover:bg-clay-tint hover:text-clay"><LogOut size={18} aria-hidden="true" />{busy ? "กำลังออก…" : "ออกจากระบบ"}</button></div>
    </aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link href="/app" className="font-display text-lg text-indigo lg:hidden">บวรไทย</Link><p className="hidden text-sm text-ink-soft lg:block">ชุมชนของเรา <span className="mx-2 text-border">/</span><span className="font-semibold text-ink">{ROLE_LABEL[effectiveRole]}</span></p><div className="flex min-w-0 items-center gap-3"><span className="hidden text-xs text-ink-soft sm:block">{online ? "เชื่อมต่อระบบ" : "ออฟไลน์"}</span><span className={`h-2 w-2 rounded-full ${online ? "bg-jade" : "bg-clay"}`} aria-hidden="true" /><Link href="/account" className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-tint font-semibold text-indigo">{profile.full_name.slice(0, 1)}</span><span className="hidden max-w-48 truncate text-sm font-semibold sm:block">{profile.full_name}</span></Link><button type="button" onClick={() => setMenuOpen(true)} aria-label="เปิดเมนูทั้งหมด" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border lg:hidden"><Menu size={20} /></button></div></div></header>
      {!online && <div role="status" className="flex items-center justify-center gap-2 bg-marigold-tint px-5 py-3 text-sm text-marigold"><WifiOff size={17} aria-hidden="true" />ไม่มีอินเทอร์เน็ต ข้อมูลอาจยังไม่เป็นปัจจุบัน</div>}
      {error && <p role="alert" className="mx-auto max-w-6xl px-5 pt-4 text-sm text-clay">{error}</p>}
      <main id="app-main" className="mx-auto max-w-6xl px-5 pb-28 pt-7 sm:px-8 sm:pt-9 lg:pb-10">{children}</main>
      <nav aria-label="เมนูมือถือ" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">{mobileLinks.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold ${pathname === link.href ? "text-indigo" : "text-ink-soft"}`}><link.icon size={22} aria-hidden="true" />{link.label}</Link>)}{links.length > mobileLinks.length && <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm text-ink-soft"><Menu size={22} aria-hidden="true" />เพิ่มเติม</button>}</nav>
    </div>
    <dialog ref={menuDialog} onClose={() => setMenuOpen(false)} onCancel={() => setMenuOpen(false)} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink backdrop:bg-ink/35" aria-label="เมนูทั้งหมด"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">เมนูทั้งหมด</h2><button type="button" onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border"><X size={20} /></button></div><nav className="space-y-1">{navItems()}</nav><div className="mt-5"><InstallPwa /></div><button type="button" onClick={signOut} disabled={busy} className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-xl bg-clay-tint px-4 text-sm font-semibold text-clay"><LogOut size={18} aria-hidden="true" />ออกจากระบบ</button></dialog>
  </div>;
}
