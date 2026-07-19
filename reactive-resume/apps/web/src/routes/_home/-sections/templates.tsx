import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { TemplateMetadata } from "@/dialogs/resume/template/data";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { Button } from "@reactive-resume/ui/components/button";
import { templates } from "@/dialogs/resume/template/data";

type FeaturedTemplate = {
	id: string;
	category: string;
	metadata: TemplateMetadata;
};

const selectedTemplateIds = ["bronzor", "ditto", "glalie", "lapras", "kakuna", "gengar"];

function getCategoryByTemplate(): Record<string, string> {
	return {
		bronzor: t({ id: "home.templates.category.professional", message: "Profissional" }),
		ditto: t({ id: "home.templates.category.simple", message: "Simples" }),
		glalie: t({ id: "home.templates.category.executive", message: "Executivo" }),
		lapras: t({ id: "home.templates.category.technology", message: "Tecnologia" }),
		kakuna: t({ id: "home.templates.category.firstJob", message: "Primeiro emprego" }),
		gengar: t({ id: "home.templates.category.operations", message: "Atendimento e operacoes" }),
	};
}

function getFeaturedTemplates(): FeaturedTemplate[] {
	const categoryByTemplate = getCategoryByTemplate();

	return selectedTemplateIds
		.map((id) => ({ id, metadata: templates[id as keyof typeof templates], category: categoryByTemplate[id] }))
		.filter((item): item is FeaturedTemplate => Boolean(item.metadata));
}

function TemplateCard({ item, index }: { item: FeaturedTemplate; index: number }) {
	return (
		<m.article
			className="group overflow-hidden rounded-2xl border bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0"
			initial={{ opacity: 0, y: 18 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.2 }}
			transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.18) }}
		>
			<div className="aspect-page overflow-hidden bg-slate-100">
				<img src={item.metadata.imageUrl} alt={t({ id: "home.templates.previewAlt", message: "Pre-visualizacao do modelo {templateName}", values: { templateName: item.metadata.name } })} loading="lazy" className="size-full object-cover" />
			</div>
			<div className="space-y-4 p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 className="font-semibold text-slate-950 dark:text-white">{item.metadata.name}</h3>
						<p className="mt-1 text-sm text-muted-foreground">{item.category}</p>
					</div>
					<span className="rounded-full border bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
						{item.metadata.sidebarPosition === "none" ? t({ id: "home.templates.oneColumn", message: "Uma coluna" }) : t({ id: "home.templates.twoColumns", message: "Duas colunas" })}
					</span>
				</div>
				<Button size="sm" className="w-full" nativeButton={false} render={<Link to="/dashboard/resumes"><Trans id="home.templates.useTemplate">Usar este modelo</Trans></Link>} />
			</div>
		</m.article>
	);
}

export function Templates() {
	const featuredTemplates = getFeaturedTemplates();

	return (
		<section id="templates" className="p-5 md:p-8 xl:py-14">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-4">
					<p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
						<Trans id="home.templates.eyebrow">Modelos</Trans>
					</p>
					<h2 className="max-w-3xl font-bold text-2xl tracking-tight md:text-4xl xl:text-5xl">
						<Trans id="home.templates.title">Escolha um modelo claro, profissional e adaptado ao seu objetivo.</Trans>
					</h2>
					<p className="max-w-3xl text-muted-foreground leading-relaxed">
						<Trans id="home.templates.description">A galeria apresenta apenas modelos suportados pelo CV Builder. Pode ajustar conteudo, secoes, cores e exportar em PDF.</Trans>
					</p>
				</div>
				<Button variant="outline" nativeButton={false} render={<Link to="/templates/"><Trans id="home.templates.viewAll">Ver todos os modelos</Trans></Link>} />
			</div>

			<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{featuredTemplates.map((item, index) => (
					<TemplateCard key={item.id} item={item} index={index} />
				))}
			</div>
		</section>
	);
}
