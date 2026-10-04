import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { OrderStatus } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/domain";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-5 shadow-sm sm:p-6 ${className}`}>{children}</div>
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
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-head font-semibold text-sm transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-[#2e3e68] text-white hover:bg-[#1b2547]",
    accent: "bg-[#925716] text-white hover:bg-[#75450f]",
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
      <span className="block font-head font-medium text-sm text-ink-soft mb-2">
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
      className={`min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-base text-ink outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-tint ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-ink outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-tint min-h-24 resize-y ${props.className ?? ""}`}
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
      className={`inline-flex items-center rounded-full px-3 py-1.5 font-head font-medium text-xs whitespace-nowrap ${STATUS_CLASS[status]}`}
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
    <div className="mb-7">
      <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="text-ink-soft text-sm leading-7 mt-3">{subtitle}</p>}
    </div>
  );
}
