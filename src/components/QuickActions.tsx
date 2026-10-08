import Link from "next/link";
import { ArrowRight, Bike, CheckCircle2, ClipboardList, Package, Store, UserRound, Wallet } from "lucide-react";
import type { UserRole } from "@/lib/domain";

const customer = [
  { href: "#shops", title: "สั่งอาหาร / ของใช้", icon: Store },
  { href: "/customer/orders", title: "ติดตามออเดอร์", icon: ClipboardList },
  { href: "/customer/parcel", title: "ส่งพัสดุ", icon: Package },
  { href: "/customer/ride", title: "เรียกรถ", icon: Bike },
];
const merchant = [
  { href: "/merchant", title: "เพิ่มเมนู / ราคา", icon: Store },
  { href: "/merchant/earnings", title: "ตรวจรายรับ", icon: Wallet },
  { href: "/account", title: "ข้อมูลร้าน / ผูก LINE", icon: UserRound },
];
const driver = [
  { href: "#driver-jobs", title: "ดูงานจัดส่ง", icon: Bike },
  { href: "/driver/earnings", title: "ตรวจรายรับ", icon: Wallet },
  { href: "/account", title: "บัญชี / ผูก LINE", icon: UserRound },
];
const admin = [
  { href: "/admin/orders", title: "จัดการออเดอร์", icon: ClipboardList },
  { href: "/admin/approvals", title: "อนุมัติสมาชิก", icon: CheckCircle2 },
  { href: "/admin/accounts", title: "ตรวจเงิน / โอนออก", icon: Wallet },
];
const ACTIONS = { customer, merchant, driver, admin, superadmin: admin };

export default function QuickActions({ role }: { role: UserRole }) {
  const actions = ACTIONS[role];
  return (
    <nav aria-label="งานหลัก" className={`mb-6 grid grid-cols-2 gap-3 ${actions.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      {actions.map(({ href, title, icon: Icon }) => (
        <Link key={href} href={href} className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm font-semibold text-indigo shadow-sm transition hover:border-indigo hover:bg-indigo-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo">
          <Icon size={24} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 leading-6">{title}</span>
          <ArrowRight size={16} className="ml-auto hidden shrink-0 sm:block" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
