import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ListIcon, TranslateIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { m, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { LocaleCombobox } from "@/features/locale/combobox";
import { ThemeToggleButton } from "@/features/theme/toggle-button";
import { getSession } from "@/libs/auth/session";
import { cvBuilderBranding } from "@/libs/branding";

type SessionUser = {
	name?: string | null;
	email?: string | null;
};

export function Header() {
	const y = useMotionValue(0);
	const lastScroll = useRef(0);
	const ticking = useRef(false);
	const springY = useSpring(y, { stiffness: 300, damping: 40 });
	const [mobileOpen, setMobileOpen] = useState(false);
	const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

	useEffect(() => {
		let mounted = true;
		getSession()
			.then((session) => {
				if (!mounted) return;
				setSessionUser((session?.user as SessionUser | undefined) ?? null);
			})
			.catch(() => {
				if (mounted) setSessionUser(null);
			});

		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;

		function onScroll() {
			const current = window.scrollY ?? 0;
			if (!ticking.current) {
				window.requestAnimationFrame(() => {
					if (current > 32 && current > lastScroll.current) y.set(-100);
					else y.set(0);
					lastScroll.current = current;
					ticking.current = false;
				});
				ticking.current = true;
			}
		}

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [y]);

	const accountLabel = sessionUser?.name || sessionUser?.email || t({ id: "home.header.account", message: "Conta" });
	const navItems = [
		{ label: t({ id: "home.header.nav.create", message: "Criar CV" }), href: "/dashboard/resumes" },
		{ label: t({ id: "home.header.nav.templates", message: "Modelos" }), href: "#templates" },
		{ label: t({ id: "home.header.nav.howItWorks", message: "Como funciona" }), href: "#how-it-works" },
		{ label: t({ id: "home.header.nav.faq", message: "Perguntas frequentes" }), href: "#frequently-asked-questions" },
	];

	return (
		<m.header
			style={{ y: springY }}
			className="fixed inset-x-0 top-0 z-50 border-b border-red-100/70 bg-background/90 shadow-sm backdrop-blur-lg transition-colors"
			initial={{ y: -100, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.35, ease: "easeOut" }}
		>
			<nav aria-label={t({ id: "home.header.navAriaLabel", message: "Navegacao principal" })} className="container mx-auto flex items-center gap-x-4 px-4 py-3 sm:px-6 lg:px-12">
				<Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80" aria-label={t({ id: "home.header.homeAriaLabel", message: "Parvagas CV Builder - Ir para a pagina inicial" })}>
					<BrandIcon className="size-10" />
					<span className="hidden font-semibold tracking-tight text-foreground sm:inline"><Trans id="home.header.brand">Parvagas CV Builder</Trans></span>
				</Link>

				<div className="hidden items-center gap-x-2 lg:flex">
					{navItems.map((item) =>
						item.href.startsWith("/") ? (
							<Link key={item.href} to={item.href} className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-red-50 hover:text-red-700">
								{item.label}
							</Link>
						) : (
							<a key={item.href} href={item.href} className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-red-50 hover:text-red-700">
								{item.label}
							</a>
						),
					)}
					<a href={cvBuilderBranding.dashboardUrl} className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-red-50 hover:text-red-700">
						<Trans id="home.header.backToParvagas">Voltar ao Parvagas</Trans>
					</a>
				</div>

				<div className="ml-auto flex items-center gap-x-2">
					<LocaleCombobox
						render={
							<Button size="icon" variant="ghost" aria-label={t({ id: "home.header.changeLanguage", message: "Alterar idioma" })}>
								<TranslateIcon />
							</Button>
						}
					/>
					<ThemeToggleButton />

					{sessionUser ? (
						<div className="hidden items-center gap-x-2 sm:flex">
							<span className="max-w-36 truncate rounded-full border bg-secondary px-3 py-2 text-sm font-semibold">{accountLabel}</span>
							<Button size="sm" nativeButton={false} render={<Link to="/dashboard/resumes"><Trans id="home.header.myCvs">Os meus CVs</Trans></Link>} />
						</div>
					) : (
						<div className="hidden items-center gap-x-2 sm:flex">
							<Button size="sm" variant="ghost" nativeButton={false} render={<a href="/auth/parvagas/start"><Trans id="home.header.signIn">Entrar</Trans></a>} />
							<Button size="sm" nativeButton={false} render={<a href="/auth/parvagas/start"><Trans id="home.header.createFree">Criar CV gratuitamente</Trans></a>} />
						</div>
					)}

					<Button size="icon" variant="ghost" aria-label={t({ id: "home.header.openMenu", message: "Abrir menu" })} onClick={() => setMobileOpen(true)}>
						<ListIcon />
					</Button>
				</div>
			</nav>

			{mobileOpen ? (
				<div className="border-t bg-background p-4 shadow-lg lg:hidden">
					<div className="mb-4 flex items-center justify-between">
						<span className="font-semibold"><Trans id="home.header.brand">Parvagas CV Builder</Trans></span>
						<Button size="icon" variant="ghost" aria-label={t({ id: "home.header.closeMenu", message: "Fechar menu" })} onClick={() => setMobileOpen(false)}>
							<XIcon />
						</Button>
					</div>
					<div className="grid gap-2">
						{navItems.map((item) =>
							item.href.startsWith("/") ? (
								<Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-secondary">
									{item.label}
								</Link>
							) : (
								<a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-secondary">
									{item.label}
								</a>
							),
						)}
						<a href={cvBuilderBranding.dashboardUrl} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-secondary">
							<Trans id="home.header.backToParvagas">Voltar ao Parvagas</Trans>
						</a>
						{sessionUser ? (
							<Link to="/dashboard/resumes" onClick={() => setMobileOpen(false)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
								<Trans id="home.header.myCvs">Os meus CVs</Trans>
							</Link>
						) : (
							<a href="/auth/parvagas/start" className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
								<Trans id="home.header.signInWithParvagas">Entrar com Parvagas</Trans>
							</a>
						)}
					</div>
				</div>
			) : null}
		</m.header>
	);
}
