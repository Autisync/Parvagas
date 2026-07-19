import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { Button } from "@reactive-resume/ui/components/button";

function getSteps() {
	return [
		["1", t({ id: "home.prefooter.step1.title", message: "Entre com a sua conta Parvagas" }), t({ id: "home.prefooter.step1.description", message: "A autenticacao usa um codigo temporario de uso unico, sem partilhar tokens no navegador." })],
		["2", t({ id: "home.prefooter.step2.title", message: "Importe o seu perfil" }), t({ id: "home.prefooter.step2.description", message: "Reveja experiencia, formacao, idiomas e competencias antes de criar o CV." })],
		["3", t({ id: "home.prefooter.step3.title", message: "Escolha e personalize" }), t({ id: "home.prefooter.step3.description", message: "Selecione um modelo suportado e ajuste conteudo, secoes e apresentacao visual." })],
		["4", t({ id: "home.prefooter.step4.title", message: "Exporte e utilize" }), t({ id: "home.prefooter.step4.description", message: "Descarregue em PDF e volte ao Parvagas para continuar a candidatura." })],
	];
}

export function Prefooter() {
	const steps = getSteps();

	return (
		<section id="how-it-works" className="relative overflow-hidden bg-slate-950 px-5 py-14 text-white md:px-8">
			<div className="relative grid gap-10 lg:grid-cols-[0.85fr,1.15fr] lg:items-center">
				<m.div
					className="max-w-2xl space-y-5 will-change-[transform,opacity]"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.45 }}
				>
					<p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
						<Trans id="home.prefooter.eyebrow">Como funciona</Trans>
					</p>
					<h2 className="font-bold text-2xl tracking-tight md:text-4xl">
						<Trans id="home.prefooter.title">Do perfil Parvagas ao CV pronto para candidatura.</Trans>
					</h2>
					<p className="text-slate-300 leading-relaxed">
						<Trans id="home.prefooter.description">Entre com a sua conta, importe o que ja esta no portal, escolha um modelo e volte sempre que precisar de editar ou exportar uma nova versao.</Trans>
					</p>
					<div className="flex flex-col gap-3 sm:flex-row">
						<Button nativeButton={false} render={<a href="/auth/parvagas/start"><Trans id="home.prefooter.primaryCta">Criar CV com o meu perfil</Trans></a>} />
						<Button variant="outline" nativeButton={false} render={<Link to="/dashboard/resumes"><Trans id="home.prefooter.secondaryCta">Os meus CVs</Trans></Link>} />
					</div>
				</m.div>

				<div className="grid gap-4 sm:grid-cols-2">
					{steps.map(([step, title, description]) => (
						<div key={step} className="rounded-2xl border border-white/10 bg-white/5 p-5">
							<span className="inline-flex size-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold">{step}</span>
							<h3 className="mt-4 font-semibold">{title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
