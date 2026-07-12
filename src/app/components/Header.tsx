"use client";

import { useEffect, useState } from "react";
import { Dialog, Menu, Transition } from "@headlessui/react";
import Image from "next/image";
import { Bars3Icon, ChevronDownIcon, UserCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getToken, getUser, logoutCurrentSession } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import { ENABLE_I18N } from "@/config/appConfig";

const Logo = "/icon2.png";

const isCurrentPath = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
};

const isExternalHref = (href: string) => /^https?:\/\//.test(href);

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<{ role?: string; name?: string; email?: string } | null>(null);
  const { locale, dict, changeLocale } = useClientLocale();
  const isPortalPath = pathname.startsWith("/Portal/");

  const navigation = [
    { name: dict.header.jobs, href: "/Vagas-Disponiveis/" },
    { name: dict.header.companies, href: "/Empresa/" },
    { name: dict.header.career, href: "/Dicas-de-Carreira/" },
  ];

  const openCvBuilder = () => {
    router.push(authUser ? "/Portal/Candidato/Construtor-CV" : "/Submission#criar-cv");
  };

  const renderNavigationItem = (item: { name: string; href: string }) => {
    const active = !isExternalHref(item.href) && isCurrentPath(pathname, item.href);
    const className = `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-red-600 text-white shadow-md"
        : "text-slate-700 hover:bg-red-50 hover:text-red-700"
    }`;

    if (isExternalHref(item.href)) {
      return (
        <a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {item.name}
        </a>
      );
    }

    return (
      <Link key={item.name} href={item.href} className={className}>
        {item.name}
      </Link>
    );
  };

  const renderMobileNavigationItem = (item: { name: string; href: string }) => {
    const active = !isExternalHref(item.href) && isCurrentPath(pathname, item.href);
    const className = `block rounded-xl px-4 py-3 text-base font-semibold transition ${
      active
        ? "bg-red-600 text-white"
        : "text-slate-800 hover:bg-red-50 hover:text-red-700"
    }`;

    if (isExternalHref(item.href)) {
      return (
        <a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {item.name}
        </a>
      );
    }

    return (
      <Link key={item.name} href={item.href} className={className}>
        {item.name}
      </Link>
    );
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = getToken();
    const user = getUser() as { role?: string; name?: string; fullName?: string; email?: string } | null;
    if (token && user) {
      setAuthUser({
        role: user.role,
        name: String(user.name || user.fullName || "").trim(),
        email: String(user.email || "").trim(),
      });
      return;
    }
    setAuthUser(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleSignout = () => {
    setMobileMenuOpen(false);
    setAuthUser(null);
    // Optimistic clear + background server logout + hard redirect to /Login.
    logoutCurrentSession(getToken(), { redirectTo: "/Login" });
  };

  const getPortalRoute = (role?: string) => {
    if (role === "company") return "/Portal/Empresa/Perfil";
    if (role === "admin") return "/Portal/Admin";
    return "/Portal/Candidato";
  };

  const getInitials = () => {
    const source = String(authUser?.name || authUser?.email || "U").trim();
    if (!source) return "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-red-100/70 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
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
            <>
              {navigation.map(renderNavigationItem)}
              <button
                type="button"
                onClick={openCvBuilder}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-red-50 hover:text-red-700"
              >
                {dict.header.cvBuilder}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
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
          {authUser ? (
            <Menu as="div" className="relative hidden sm:block">
              <Menu.Button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-red-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                  {getInitials()}
                </span>
                <span className="max-w-[140px] truncate">{authUser.name || "Utilizador"}</span>
                <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
              </Menu.Button>
              <Transition
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-in"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <Menu.Items className="absolute right-0 z-30 mt-2 w-52 origin-top-right rounded-2xl border border-slate-200 bg-white p-1 shadow-lg focus:outline-none">
                  <Menu.Item>
                    {({ active }) => (
                      <Link
                        href={getPortalRoute(authUser.role)}
                        className={`block rounded-xl px-3 py-2 text-sm font-medium ${
                          active ? "bg-red-50 text-red-700" : "text-slate-700"
                        }`}
                      >
                        Meu Perfil
                      </Link>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={handleSignout}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${
                          active ? "bg-slate-100 text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {dict.header.signOut}
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Transition>
            </Menu>
          ) : (
            <>
              <Link
                href="/Login"
                className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 sm:inline-flex"
              >
                Entrar
              </Link>
              <Link
                href="/Signup"
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Criar conta
              </Link>
            </>
          )}
          {authUser && (
            <Link
              href={getPortalRoute(authUser.role)}
              className="inline-flex items-center rounded-full border border-slate-200 p-2 text-slate-700 sm:hidden"
              aria-label="Abrir perfil"
            >
              <UserCircleIcon className="h-6 w-6" aria-hidden="true" />
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
              {navigation.map(renderMobileNavigationItem)}
              <button
                type="button"
                onClick={openCvBuilder}
                className="block w-full rounded-xl px-4 py-3 text-left text-base font-semibold text-slate-800 transition hover:bg-red-50 hover:text-red-700"
              >
                {dict.header.cvBuilder}
              </button>
            </div>
          )}

          <div className="mt-7 space-y-3 border-t border-red-100 pt-5">
            {authUser ? (
              <>
                <Link
                  href={getPortalRoute(authUser.role)}
                  className="block rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Meu Perfil
                </Link>
                <button
                  type="button"
                  onClick={handleSignout}
                  className="block w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  {dict.header.signOut}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/Login"
                  className="block rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Entrar
                </Link>
                <Link
                  href="/Signup"
                  className="block rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </Dialog.Panel>
      </Dialog>
    </header>
  );
}
