import { Trans } from "@lingui/react/macro";
import { QuotesIcon } from "@phosphor-icons/react";
import { m } from "motion/react";
import { useMemo } from "react";

const email = "suporte@parvagas.pt";

const testimonials: string[] = [
	"Great site. Love the interactive interface. You can tell it's designed by someone who wants to use it.",

	"Truly everything about the UX is so intuitive, fluid and lets you customize your CV how you want and so rapidly. I thank you so much for putting the work to release something like this.",

	"A experiencia no Parvagas CV Builder e excelente e o processo de criar CV ficou muito mais rapido.",

	"A plataforma e simples de usar e o editor ajuda muito a melhorar o CV em poucos minutos.",

	"Consegui organizar melhor a minha experiencia profissional e partilhar o CV com empresas sem complicacoes.",

	"Com o Parvagas CV Builder, finalizei o meu CV e consegui candidatar-me com mais confianca.",

	"Your CV generator just saved my day! Thank you so much, great work!",

	"As sugestoes de estrutura e o resultado final em PDF ficaram muito profissionais.",

	"Hey! Thank you so much for making this fantastic tool! It helped me get a new job as a Research Software Engineer at Arizona State University.",

	"A versao da Parvagas esta muito bem adaptada ao mercado local e ao fluxo de candidaturas.",

	"Consegui preparar e partilhar o CV com mais qualidade e rapidez usando o Parvagas CV Builder.",
];

type TestimonialCardProps = {
	testimonial: string;
};

function TestimonialCard({ testimonial }: TestimonialCardProps) {
	return (
		<m.div
			className="group relative flex w-full flex-col overflow-hidden text-pretty rounded-2xl border bg-card p-4 will-change-transform"
			initial={{ scale: 1, boxShadow: "0 0 20px 0 rgba(0, 0, 0, 0)" }}
			whileHover={{ scale: 1.2, zIndex: 100, boxShadow: "0 0 40px 0 rgba(0, 0, 0, 0.5)" }}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
		>
			<QuotesIcon
				weight="fill"
				className="absolute -right-2 -bottom-4 size-18 opacity-10 transition-[bottom] duration-200 group-hover:-bottom-16"
			/>
			<p className="flex-1 text-muted-foreground leading-relaxed">{testimonial}</p>
		</m.div>
	);
}

type TestimonialColumnProps = {
	id: string;
	testimonials: string[];
};

function TestimonialColumn({ id, testimonials }: TestimonialColumnProps) {
	return (
		<div className="flex w-[320px] shrink-0 flex-col gap-y-4 sm:w-[360px] md:w-[400px]">
			{testimonials.map((testimonial) => (
				<TestimonialCard key={`${id}-${testimonial}`} testimonial={testimonial} />
			))}
		</div>
	);
}

type TestimonialColumnData = {
	id: string;
	testimonials: string[];
};

type MarqueeMasonryProps = {
	columns: TestimonialColumnData[];
	direction: "left" | "right";
	duration?: number;
};

function MarqueeMasonry({ columns, direction, duration = 30 }: MarqueeMasonryProps) {
	const animateX = direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"];
	const marqueeColumns = columns.flatMap((column) => [
		{ ...column, id: `${column.id}-primary` },
		{ ...column, id: `${column.id}-repeat` },
	]);

	return (
		<m.div
			className="flex items-start gap-x-4 will-change-transform"
			animate={{ x: animateX }}
			transition={{ x: { repeat: Number.POSITIVE_INFINITY, repeatType: "loop", duration, ease: "linear" } }}
		>
			{marqueeColumns.map((column) => (
				<TestimonialColumn key={column.id} id={column.id} testimonials={column.testimonials} />
			))}
		</m.div>
	);
}

export function Testimonials() {
	const columns = useMemo(() => {
		const columns: TestimonialColumnData[] = [];

		for (let index = 0; index < testimonials.length; index += 2) {
			columns.push({ id: `column-${index / 2}`, testimonials: testimonials.slice(index, index + 2) });
		}

		return columns;
	}, []);

	return (
		<section id="testimonials" className="overflow-hidden py-12 md:py-16 xl:py-20">
			<m.div
				className="mb-10 flex flex-col items-center gap-y-4 px-4 text-center md:px-8"
				initial={{ opacity: 0, y: 20 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true }}
				transition={{ duration: 0.6 }}
			>
				<h2 className="font-semibold text-2xl tracking-tight md:text-4xl xl:text-5xl">
					<Trans>Testimonials</Trans>
				</h2>

				<p className="max-w-4xl text-balance text-muted-foreground leading-relaxed">
					<Trans>
						Utilizadores da Parvagas partilham regularmente feedback sobre como o CV Builder os ajuda a melhorar o perfil
						profissional. Se quiser partilhar a sua experiencia, envie um email para{" "}
						<a
							href={`mailto:${email}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
						>
							{email}
						</a>
						.
					</Trans>
				</p>
			</m.div>

			<div className="relative">
				{/* Left fade */}
				<div className="pointer-events-none absolute inset-s-0 top-0 bottom-0 z-10 w-16 bg-linear-to-r from-background to-transparent sm:w-24 md:w-32 lg:w-48" />

				{/* Right fade */}
				<div className="pointer-events-none absolute inset-e-0 top-0 bottom-0 z-10 w-16 bg-linear-to-l from-background to-transparent sm:w-24 md:w-32 lg:w-48" />

				<MarqueeMasonry columns={columns} direction="left" duration={60} />
			</div>
		</section>
	);
}
