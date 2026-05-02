"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getToken } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import { ENABLE_I18N } from "@/config/appConfig";
import Logo from "/public/icon2.png";

const isCurrentPath = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { locale, dict, changeLocale } = useClientLocale();
  const isPortalPath = pathname.startsWith("/Portal/");

  const navigation = [
    { name: dict.header.home, href: "/" },
    { name: dict.header.jobs, href: "/Vagas-Disponiveis/" },
    { name: dict.header.companies, href: "/Empresa/" },
    { name: dict.header.career, href: "/Dicas-de-Carreira/" },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = getToken();
    setIsAuthenticated(Boolean(token));
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleSignout = () => {
    clearToken();
    setMobileMenuOpen(false);
    setIsAuthenticated(false);
    router.push("/Login");
  };

  return (
    <header className="border-b border-red-100/70 bg-white">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        aria-label="Global"
      >
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-red-100 bg-white p-2 text-red-700 shadow-sm"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">{dict.header.openMenu}</span>
            <Bars3Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <Link href="/" className="group -m-1.5 p-1.5">
          <span className="sr-only">Parvagas</span>
          <Image
            width={400}
            height={400}
            className="h-10 w-auto transition duration-300 group-hover:scale-105"
            src={Logo}
            alt="Parvagas"
          />
        </Link>

        <div className="hidden lg:flex lg:items-center lg:gap-2">
          {isPortalPath ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {dict.header.portalMode}
            </span>
          ) : (
            navigation.map((item) => {
              const active = isCurrentPath(pathname, item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-red-600 text-white shadow-md"
                      : "text-slate-700 hover:bg-red-50 hover:text-red-700"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/Login"
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 sm:inline-flex"
          >
            {dict.header.portal}
          </Link>
          {ENABLE_I18N && (
            <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-1 sm:inline-flex">
            <button
              type="button"
              onClick={() => {
                changeLocale("pt");
                router.refresh();
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locale === "pt" ? "bg-red-600 text-white" : "text-slate-600"}`}
              aria-label="Mudar para português"
            >
              PT
            </button>
            <button
              type="button"
              onClick={() => {
                changeLocale("en");
                router.refresh();
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locale === "en" ? "bg-red-600 text-white" : "text-slate-600"}`}
              aria-label="Switch to English"
            >
              EN
            </button>
            </div>
          )}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleSignout}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {dict.header.signOut}
            </button>
          ) : (
            <Link
              href="/Submission/"
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              {dict.header.submitCv}
            </Link>
          )}
        </div>
      </nav>

      <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Panel className="fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm overflow-y-auto bg-white px-5 py-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-red-100 pb-4">
            <Link href="/" className="-m-1.5 p-1.5">
              <Image width={200} height={200} className="h-8 w-auto" src={Logo} alt="Parvagas" />
            </Link>
            <button
              type="button"
              className="rounded-xl border border-red-100 bg-white p-2 text-red-700"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">{dict.header.closeMenu}</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {!isPortalPath && (
            <div className="mt-5 space-y-2">
              {navigation.map((item) => {
                const active = isCurrentPath(pathname, item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`block rounded-xl px-4 py-3 text-base font-semibold transition ${
                      active
                        ? "bg-red-600 text-white"
                        : "text-slate-800 hover:bg-red-50 hover:text-red-700"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-7 space-y-3 border-t border-red-100 pt-5">
            <Link
              href="/Login"
              className="block rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700"
            >
              {dict.header.enterPortal}
            </Link>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignout}
                className="block w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                {dict.header.signOut}
              </button>
            ) : (
              <Link
                href="/Submission/"
                className="block rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                {dict.header.submitCv}
              </Link>
            )}
          </div>
        </Dialog.Panel>
      </Dialog>
    </header>
  );
}
