import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, BookOpenIcon, SparkleIcon } from "@phosphor-icons/react";
import { m } from "motion/react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { CometCard } from "@/components/animation/comet-card";
import { Spotlight } from "@/components/animation/spotlight";

export function Hero() {
	return (
		<section
			id="hero"
			className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden border-b bg-background py-24"
		>
			<Spotlight
				gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, rgba(248, 113, 113, .18) 0, rgba(220, 38, 38, .07) 50%, rgba(127, 29, 29, 0) 80%)"
				gradientSecond="radial-gradient(50% 50% at 50% 50%, rgba(254, 202, 202, .12) 0, rgba(248, 113, 113, .04) 80%, transparent 100%)"
				gradientThird="radial-gradient(50% 50% at 50% 50%, rgba(34, 211, 238, .08) 0, rgba(34, 211, 238, .03) 80%, transparent 100%)"
			/>

			<m.div
				className="w-full will-change-[transform,opacity]"
				initial={{ opacity: 0, y: 100 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 1.1, ease: "easeOut" }}
			>
				<CometCard
					glareOpacity={0.12}
					className="relative mx-auto -mb-12 3xl:max-w-7xl max-w-4xl px-8 md:-mb-24 md:px-12 lg:px-0"
				>
					<video
						loop
						muted
						autoPlay
						playsInline
						width={1146}
						height={720}
						src="/videos/timelapse.mp4"
						aria-label={t({ id: "home.hero.videoAriaLabel", message: "Demonstracao animada da criacao de um curriculo no Parvagas CV Builder" })}
						className="pointer-events-none aspect-[1146/720] w-full rounded-md border object-cover"
					/>

					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-40% via-transparent to-background"
					/>
				</CometCard>
			</m.div>

			<div className="relative z-10 flex max-w-2xl flex-col items-center gap-y-6 px-4 text-center xs:px-0">
				<m.a
					className="will-change-[transform,opacity]"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, delay: 0.55 }}
					whileHover={{ y: -2, scale: 1.01 }}
					whileTap={{ scale: 0.985 }}
					target="_blank"
					rel="noopener noreferrer"
					href="https://parvagas.pt"
				>
					<Badge variant="secondary" className="h-auto gap-1.5 px-3 py-0.5">
						<SparkleIcon aria-hidden="true" className="size-3.5" weight="fill" />
						<Trans id="home.hero.badge">Parvagas CV Builder</Trans>
					</Badge>
				</m.a>

				<m.div
					className="will-change-[transform,opacity]"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, delay: 0.7 }}
				>
					<p className="font-medium text-red-700 tracking-tight md:text-lg dark:text-red-300">
						<Trans id="home.hero.eyebrow">Para candidatos em Angola e Portugal</Trans>
					</p>
					<h1 className="mt-1 font-semibold text-4xl tracking-tight md:text-5xl lg:text-6xl">
						<Trans id="home.hero.title">Crie um CV profissional e aumente as suas oportunidades.</Trans>
					</h1>
				</m.div>

				<m.p
					className="max-w-xl text-base text-muted-foreground leading-relaxed will-change-[transform,opacity] md:text-lg"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, delay: 0.82 }}
				>
					<Trans id="home.hero.description">Transforme o seu perfil Parvagas num curriculo moderno, organizado e pronto para candidaturas. Escolha um modelo, personalize o conteudo e exporte em PDF.</Trans>
				</m.p>

				<m.div
					className="flex flex-col items-center gap-3 will-change-[transform,opacity] sm:flex-row sm:gap-4"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, delay: 0.95 }}
				>
					<Button
						size="lg"
						nativeButton={false}
						className="group relative overflow-hidden px-4"
						render={
							<a href="/auth/parvagas/start">
								<span className="relative z-10 flex items-center gap-2">
									<Trans id="home.hero.primaryCta">Comecar agora</Trans>
									<ArrowRightIcon aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
								</span>
							</a>
						}
					/>

					<Button
						size="lg"
						variant="ghost"
						className="gap-2 px-4"
						nativeButton={false}
						render={
							<a href="#templates">
								<BookOpenIcon aria-hidden="true" className="size-4" />
								<Trans id="home.hero.secondaryCta">Ver modelos</Trans>
							</a>
						}
					/>
				</m.div>
			</div>

			<m.div
				aria-hidden="true"
				role="presentation"
				className="absolute inset-s-1/2 bottom-8 -translate-x-1/2"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 1.25, duration: 0.7 }}
			>
				<m.div
					className="flex h-8 w-5 items-start justify-center rounded-full border border-muted-foreground/30 p-1.5 will-change-transform"
					animate={{ y: [0, 5, 0] }}
					transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				>
					<m.div className="h-1.5 w-1 rounded-full bg-muted-foreground/50" />
				</m.div>
			</m.div>
		</section>
	);
}
