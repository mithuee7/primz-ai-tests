import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn, initials } from "@/lib/utils";

/* ----------------------------------------------------------------- Button */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-zinc-900 text-white hover:bg-zinc-800",
        secondary: "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
        ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        danger: "bg-red-600 text-white hover:bg-red-700",
        dangerOutline: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* ------------------------------------------------------------------ Badge */
type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet" | "dark";
const toneClasses: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  dark: "bg-zinc-900 text-white",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", toneClasses[tone], className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- Card */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-zinc-200 bg-white", className)} {...props} />;
}

/* ----------------------------------------------------------------- Avatar */
const avatarSizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: keyof typeof avatarSizes; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover", avatarSizes[size], className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full bg-zinc-900 font-semibold text-white", avatarSizes[size], className)}
    >
      {initials(name)}
    </span>
  );
}

/* --------------------------------------------------------------- Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-zinc-200/70", className)} />;
}

/* ------------------------------------------------------------ Empty state */
export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">{icon}</div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Page header */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
