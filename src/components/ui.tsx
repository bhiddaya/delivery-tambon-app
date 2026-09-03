import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { OrderStatus } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/domain";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-4 ${className}`}>{children}</div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "accent";
export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-head font-semibold text-sm transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-indigo text-white",
    accent: "bg-marigold text-white",
    secondary: "bg-surface-2 text-ink",
    ghost: "bg-transparent text-indigo border border-border",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="block font-head font-semibold text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo min-h-[70px] resize-y ${props.className ?? ""}`}
    />
  );
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: "bg-marigold-tint text-marigold",
  accepted: "bg-slateblue-tint text-slateblue",
  in_progress: "bg-indigo-tint text-indigo",
  delivered: "bg-jade-tint text-jade",
  cancelled: "bg-clay-tint text-clay",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-head font-semibold text-[11px] whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-none ${on ? "bg-jade" : "bg-ink-soft/40"}`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center py-10 px-3 text-ink-soft text-sm">{children}</div>;
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="text-ink-soft text-sm mt-0.5">{subtitle}</p>}
    </div>
  );
}
