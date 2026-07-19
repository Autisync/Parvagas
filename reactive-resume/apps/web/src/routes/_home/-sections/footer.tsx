import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { m } from "motion/react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { LocaleCombobox } from "@/features/locale/combobox";
import { cvBuilderBranding } from "@/libs/branding";

type FooterLinkItem = {
	url: string;
	label: string;
};

function getLinkGroups(): Array<{ title: string; links: FooterLinkItem[] }> {
	return [
		{
			title: t({ id: "home.footer.group.parvagas", message: "Parvagas" }),
			links: [
				{ url: cvBuilderBranding.mainPlatformUrl, label: t({ id: "home.footer.backToParvagas", message: "Voltar ao Parvagas" }) },
				{ url: `${cvBuilderBranding.mainPlatformUrl}/Vagas-Disponiveis`, label: t({ id: "home.footer.candidates", message: "Candidatos" }) },
				{ url: `${cvBuilderBranding.mainPlatformUrl}/Empresa`, label: t({ id: "home.footer.companies", message: "Empresas" }) },
			],
		},
		{
			title: t({ id: "home.footer.group.support", message: "Suporte" }),
			links: [
				{ url: cvBuilderBranding.supportUrl, label: t({ id: "home.footer.contacts", message: "Contactos" }) },
				{ url: `mailto:${cvBuilderBranding.supportEmail}`, label: t({ id: "home.footer.support", message: "Suporte" }) },
				{ url: cvBuilderBranding.dashboardUrl, label: t({ id: "home.footer.candidatePortal", message: "Portal do candidato" }) },
			],
		},
		{
			title: t({ id: "home.footer.group.legal", message: "Legal" }),
			links: [
				{ url: cvBuilderBranding.privacyUrl, label: t({ id: "home.footer.privacy", message: "Privacidade" }) },
				{ url: cvBuilderBranding.termsUrl, label: t({ id: "home.footer.terms", message: "Termos" }) },
				{ url: cvBuilderBranding.mitLicenseUrl, label: t({ id: "home.footer.mitLicense", message: "Licenca MIT" }) },
			],
		},
	];
}

export function Footer() {
	const linkGroups = getLinkGroups();

	return (
		<m.footer
			id="footer"
			className="bg-background p-5 pb-8 will-change-[opacity] md:p-8 md:pb-12"
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.35 }}
		>
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr,2fr]">
				<div className="space-y-4">
					<BrandIcon variant="logo" className="h-12 w-auto" />
					<div className="space-y-2">
						<h2 className="font-semibold text-lg tracking-tight">Parvagas CV Builder</h2>
						<p className="max-w-sm text-muted-foreground text-sm leading-relaxed">
							<Trans id="home.footer.description">Ferramenta integrada no ecossistema Parvagas para criar, editar e exportar curriculos profissionais.</Trans>
						</p>
					</div>
					<LocaleCombobox />
				</div>

				<div className="grid gap-8 sm:grid-cols-3">
					{linkGroups.map((group) => (
						<div key={group.title} className="space-y-4">
							<h3 className="font-semibold text-sm text-slate-950 dark:text-white">{group.title}</h3>
							<ul className="space-y-3">
								{group.links.map((link) => (
									<li key={link.url}>
										<a href={link.url} target={link.url.startsWith("mailto:") ? undefined : "_blank"} rel={link.url.startsWith("mailto:") ? undefined : "noopener noreferrer"} className="text-sm text-muted-foreground transition hover:text-red-700">
											{link.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>

			<div className="mt-8 border-t pt-6 text-muted-foreground text-xs leading-relaxed">
				<p>
					<Trans id="home.footer.technologyAttribution">
						Plataforma tecnologica concebida e desenvolvida pela{" "}
					<a href={cvBuilderBranding.technologyPartnerUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-4">
						Autisync
					</a>
					.
					</Trans>
				</p>
				<p className="mt-2">
					<Trans id="home.footer.mitAttribution">
						Baseado no projeto open-source Reactive Resume, licenciado sob{" "}
					<a href={cvBuilderBranding.mitLicenseUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-4">
						MIT
					</a>
					. Os avisos de licenca do codigo-fonte original sao preservados.
					</Trans>
				</p>
			</div>
		</m.footer>
	);
}
