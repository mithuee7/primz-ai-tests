"use client";

import { LogOut, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOutAction } from "@/app/actions";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { MOBILE_TAB_HREFS, NAV_ITEMS } from "./nav";

export interface ShellProps {
  user: { name: string; email: string; demo: boolean };
  instagram: { connected: boolean; label: string; detail: string };
  reviewCount: number;
  children: React.ReactNode;
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-zinc-900">P</span>
      <span className="text-[15px] font-semibold tracking-tight text-white">Primz AI</span>
    </Link>
  );
}

function NavLinks({ reviewCount, onNavigate }: { reviewCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV_ITEMS.filter((i) => i.href !== "/settings").map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const count = item.badgeKey === "review" ? reviewCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
            )}
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{item.label}</span>
            {count > 0 ? <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-zinc-900">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ user, instagram, onNavigate }: Pick<ShellProps, "user" | "instagram"> & { onNavigate?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-white/10 p-3">
      <div className="rounded-xl bg-white/5 px-3 py-2.5" title={instagram.detail}>
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <span className={cn("h-2 w-2 rounded-full", instagram.connected ? "bg-emerald-400" : "bg-amber-400")} />
          Instagram
        </div>
        <p className="mt-0.5 text-xs text-zinc-400">{instagram.label}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <Avatar name={user.name} size="sm" className="bg-zinc-700" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{user.name}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
        <Link href="/settings" onClick={onNavigate} aria-label="Settings" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <Settings className="h-4 w-4" />
        </Link>
        {!user.demo ? (
          <button
            aria-label="Sign out"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await signOutAction();
                router.replace("/login");
                router.refresh();
              })
            }
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({ user, instagram, reviewCount, children }: ShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex h-dvh flex-col">
      {user.demo ? (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-300 px-3 py-1.5 text-center text-xs font-medium text-zinc-900">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Demo mode</span>
          <span>Data lives in memory and nothing is sent to Instagram.</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col bg-ink md:flex">
          <div className="px-5 py-5">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks reviewCount={reviewCount} />
          </div>
          <SidebarFooter user={user} instagram={instagram} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="flex shrink-0 items-center justify-between bg-ink px-4 py-3 md:hidden">
            <Logo />
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 text-zinc-200 hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

          {/* Mobile bottom tabs */}
          <nav className="safe-bottom flex shrink-0 border-t border-zinc-200 bg-white md:hidden" aria-label="Primary">
            {NAV_ITEMS.filter((i) => MOBILE_TAB_HREFS.includes(i.href)).map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const count = item.badgeKey === "review" ? reviewCount : 0;
              return (
                <Link key={item.href} href={item.href} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-zinc-900" : "text-zinc-400")}>
                  <item.icon className="h-5 w-5" />
                  {item.label.replace("Needs ", "")}
                  {count > 0 ? <span className="absolute right-[28%] top-1 h-2 w-2 rounded-full bg-amber-500" /> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-ink">
            <div className="flex items-center justify-between px-5 py-5">
              <Logo />
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">
              <NavLinks reviewCount={reviewCount} onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter user={user} instagram={instagram} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
