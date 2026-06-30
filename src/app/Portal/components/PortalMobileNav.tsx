"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { XMarkIcon, Bars3Icon } from "@heroicons/react/24/outline";

export interface MobileNavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Show in the bottom tab bar (max 4). Rest go in the drawer only. */
  pinned?: boolean;
}

interface Props {
  items: MobileNavItem[];
  identity: { name: string; email?: string; initial: string };
  onLogout: () => void;
  /** Extra content rendered at the bottom of the drawer (e.g. locale control). */
  extra?: ReactNode;
  /** Action rendered in the drawer header (e.g. the notification bell). */
  headerAction?: ReactNode;
  drawerOpen: boolean;
  onDrawerOpen: () => void;
  onDrawerClose: () => void;
}

export default function PortalMobileNav({
  items,
  identity,
  onLogout,
  extra,
  headerAction,
  drawerOpen,
  onDrawerOpen,
  onDrawerClose,
}: Props) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  const pinned = items.filter((i) => i.pinned).slice(0, 4);

  // Close drawer on route change
  useEffect(() => {
    onDrawerClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Trap focus + close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDrawerClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen, onDrawerClose]);

  function isActive(href: string) {
    if (href.split("/").length <= 4) return pathname === href;
    return pathname === href || pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden">
        <div className="flex items-stretch">
          {pinned.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-safe text-[10px] font-medium transition-colors",
                  active ? "text-red-600" : "text-slate-500 hover:text-slate-800",
                ].join(" ")}
              >
                <span className={["[&>svg]:h-5 [&>svg]:w-5", active ? "text-red-600" : ""].join(" ")}>
                  {item.icon}
                </span>
                <span className="truncate max-w-[56px] text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}

          {/* Menu / More button */}
          <button
            type="button"
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            onClick={onDrawerOpen}
            className={[
              "flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-safe text-[10px] font-medium transition-colors",
              drawerOpen ? "text-red-600" : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            <Bars3Icon className="h-5 w-5" />
            <span>Menu</span>
          </button>
        </div>
      </div>

      {/* ── Drawer overlay ──────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onDrawerClose}
            aria-hidden="true"
          />

          {/* Panel slides in from left */}
          <div
            ref={drawerRef}
            className="absolute bottom-0 left-0 top-0 flex w-72 flex-col overflow-y-auto bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-700 ring-1 ring-red-100">
                  {identity.initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{identity.name}</p>
                  {identity.email && (
                    <p className="truncate text-xs text-slate-500">{identity.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {headerAction}
                <button
                  type="button"
                  onClick={onDrawerClose}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Nav items */}
            <nav className="flex-1 space-y-0.5 p-3">
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                        : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900",
                    ].join(" ")}
                  >
                    <span className={active ? "text-red-700" : "text-slate-400"}>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Footer: extra + logout */}
            <div className="border-t border-slate-200 p-3 pb-safe">
              {extra && <div className="mb-3">{extra}</div>}
              <button
                type="button"
                onClick={() => { onDrawerClose(); onLogout(); }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
