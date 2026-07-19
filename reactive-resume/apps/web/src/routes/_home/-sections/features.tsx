import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Icon } from "@phosphor-icons/react";
import {
	ArrowsClockwiseIcon,
	BriefcaseIcon,
	CheckCircleIcon,
	FilePdfIcon,
	FilesIcon,
	LightbulbIcon,
	PaletteIcon,
	ShieldCheckIcon,
	SparkleIcon,
	TargetIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { m } from "motion/react";
import { Badge } from "@reactive-resume/ui/components/badge";

type Feature = {
	id: string;
	icon: Icon;
	title: string;
	description: string;
	badge?: "Pro" | "Premium";
};

function getFeatures(): Feature[] {
	return [
		{
			id: "profile",
			icon: UploadSimpleIcon,
			title: t({ id: "home.features.profile.title", message: "Perfil Parvagas integrado" }),
			description: t({ id: "home.features.profile.description", message: "Use os dados do seu perfil para iniciar um curriculo com menos preenchimento manual." }),
		},
		{
			id: "templates",
			icon: PaletteIcon,
			title: t({ id: "home.features.templates.title", message: "Modelos profissionais" }),
			description: t({ id: "home.features.templates.description", message: "Escolha layouts limpos para candidaturas em tecnologia, operacoes, atendimento e areas executivas." }),
		},
		{
			id: "pdf",
			icon: FilePdfIcon,
			title: t({ id: "home.features.pdf.title", message: "Exportacao em PDF" }),
			description: t({ id: "home.features.pdf.description", message: "Descarregue um CV pronto para anexar a candidaturas dentro ou fora do Parvagas." }),
		},
		{
			id: "ats",
			icon: TargetIcon,
			title: t({ id: "home.features.ats.title", message: "Conteudo orientado para ATS" }),
			description: t({ id: "home.features.ats.description", message: "Organize competencias, experiencia e formacao em secoes claras para leitura por recrutadores." }),
			badge: "Pro",
		},
		{
			id: "visual",
			icon: SparkleIcon,
			title: t({ id: "home.features.visual.title", message: "Personalizacao visual" }),
			description: t({ id: "home.features.visual.description", message: "Ajuste cores, tipografia e estrutura mantendo uma apresentacao profissional." }),
		},
		{
			id: "multiple",
			icon: FilesIcon,
			title: t({ id: "home.features.multiple.title", message: "Varios CVs por objetivo" }),
			description: t({ id: "home.features.multiple.description", message: "Crie versoes diferentes para areas, senioridade ou paises de candidatura." }),
			badge: "Pro",
		},
		{
			id: "privacy",
			icon: ShieldCheckIcon,
			title: t({ id: "home.features.privacy.title", message: "Privacidade e controlo" }),
			description: t({ id: "home.features.privacy.description", message: "Os seus dados ficam associados a sua conta e podem ser editados ou removidos por si." }),
		},
		{
			id: "applications",
			icon: BriefcaseIcon,
			title: t({ id: "home.features.applications.title", message: "Acompanhamento das candidaturas" }),
			description: t({ id: "home.features.applications.description", message: "Volte ao portal Parvagas para gerir candidaturas, documentos e oportunidades guardadas." }),
		},
		{
			id: "writing",
			icon: LightbulbIcon,
			title: t({ id: "home.features.writing.title", message: "Sugestoes de escrita" }),
			description: t({ id: "home.features.writing.description", message: "Receba apoio para melhorar resumo, competencias e pontos fortes quando o seu plano o permitir." }),
			badge: "Premium",
		},
		{
			id: "import",
			icon: CheckCircleIcon,
			title: t({ id: "home.features.import.title", message: "Importacao de experiencia e formacao" }),
			description: t({ id: "home.features.import.description", message: "Reaproveite experiencia, educacao, idiomas e competencias ja registadas no Parvagas." }),
		},
		{
			id: "sync",
			icon: ArrowsClockwiseIcon,
			title: t({ id: "home.features.sync.title", message: "Sincronizacao com o portal" }),
			description: t({ id: "home.features.sync.description", message: "Depois de guardar, o CV pode sincronizar estado e metadados com o portal do candidato." }),
		},
	];
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
	const Icon = feature.icon;

	return (
		<m.article
			className="group relative flex min-h-52 flex-col gap-4 border-b bg-background p-5 transition-colors hover:bg-red-50/60 sm:p-6 lg:[&:not(:nth-child(3n))]:border-r dark:hover:bg-red-950/20"
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.15 }}
			transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.18) }}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="inline-flex rounded-xl bg-red-50 p-2.5 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
					<Icon aria-hidden="true" size={24} />
				</div>
				{feature.badge ? <Badge variant="secondary">{feature.badge}</Badge> : null}
			</div>

			<div className="space-y-2">
				<h3 className="font-semibold text-base tracking-tight text-slate-950 dark:text-white">{feature.title}</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
			</div>
		</m.article>
	);
}

export function Features() {
	const features = getFeatures();

	return (
		<section id="features" className="border-t-0!">
			<div className="space-y-4 p-5 md:p-8 xl:py-14">
				<p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
					<Trans id="home.features.eyebrow">Funcionalidades</Trans>
				</p>
				<h2 className="max-w-3xl font-bold text-2xl tracking-tight md:text-4xl xl:text-5xl">
					<Trans id="home.features.title">Ferramentas praticas para criar CVs melhores, sem promessas exageradas.</Trans>
				</h2>
				<p className="max-w-3xl text-muted-foreground leading-relaxed">
					<Trans id="home.features.description">As funcionalidades dependem do plano associado a sua conta Parvagas. O CV Builder ajuda a organizar o seu percurso, mas nao garante entrevistas, emprego ou contratacao.</Trans>
				</p>
			</div>

			<div className="grid grid-cols-1 border-t sm:grid-cols-2 lg:grid-cols-3">
				{features.map((feature, index) => (
					<FeatureCard key={feature.id} feature={feature} index={index} />
				))}
			</div>
		</section>
	);
}
