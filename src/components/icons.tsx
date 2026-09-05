import type { SVGProps } from "react";

/**
 * ไอคอนเส้น (stroke-based) ชุดเล็กสำหรับแถบนำทางและปุ่มต่างๆ
 * วาดเองด้วย SVG ล้วน ไม่พึ่งพา icon library ภายนอก (ไม่ต้องติดตั้ง/โหลดจากเน็ต)
 * ทุกไอคอนใช้ viewBox 24x24, stroke ปัจจุบัน (currentColor), เส้นหนาเท่ากันเพื่อความเรียบร้อย
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}

export function BikeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M5.5 17.5 9 10h5l3.5 7.5" />
      <path d="M9 10 8 7h-2" />
      <path d="M9 10h5" />
    </svg>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5 5 4h14l1 5.5" />
      <path d="M3.5 9.5a2 2 0 0 0 4 .3 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4-.3" />
      <path d="M5 10v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M10 20.5V15a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5.5" />
    </svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h12v18l-2.5-1.5L13 21l-1-1.5-1 1.5-2.5-1.5L6 21Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3.5" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </svg>
  );
}

export function CheckBadgeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 14 5l2.5-.3 1 2.3 2.3 1L19.5 10.5 20 12.5l-2 1.5.3 2.5-2.3 1-1 2.2-2.5-.5-2 1.5-2-1.5-2.5.5-1-2.2-2.3-1 .3-2.5-2-1.5.5-2.5-2.3-1 1-2.3L10 5Z" />
      <path d="M9 12.3 11 14.3l4.5-4.6" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.55 1.55M17.55 17.55 19.1 19.1M3 12h2.2M18.8 12H21M4.9 19.1l1.55-1.55M17.55 6.45 19.1 4.9" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3" />
      <path d="M15.5 16 20 12l-4.5-4" />
      <path d="M20 12H9.5" />
    </svg>
  );
}

/** กระเป๋าเงิน — ใช้กับหน้ารายรับ */
export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <path d="M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      <path d="M21 11h-4a2 2 0 0 0 0 4h4z" />
    </svg>
  );
}

/** คน — ใช้กับหน้าบัญชีของฉัน */
export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
