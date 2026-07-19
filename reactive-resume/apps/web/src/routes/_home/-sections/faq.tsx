import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { m } from "motion/react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@reactive-resume/ui/components/accordion";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { cn } from "@reactive-resume/utils/style";
import { cvBuilderBranding } from "@/libs/branding";

const supportUrl = cvBuilderBranding.supportUrl;

type FAQItemData = {
	question: string;
	answer: React.ReactNode;
};

const getFaqItems = (): FAQItemData[] => [
	{
		question: t({ id: "home.faq.profile.question", message: "Posso usar o meu perfil Parvagas?" }),
		answer: t({ id: "home.faq.profile.answer", message: "Sim. Ao entrar pela sua conta Parvagas, pode iniciar um CV com dados do seu perfil e rever tudo antes de guardar." }),
	},
	{
		question: t({ id: "home.faq.multiple.question", message: "Posso criar mais do que um CV?" }),
		answer: t({ id: "home.faq.multiple.answer", message: "Sim, quando o seu plano permitir. O plano gratuito pode ter limites, enquanto Pro e Premium desbloqueiam mais capacidade." }),
	},
	{
		question: t({ id: "home.faq.ats.question", message: "O CV e compativel com sistemas ATS?" }),
		answer: t({ id: "home.faq.ats.answer", message: "Os modelos privilegiam estrutura clara, secoes reconheciveis e texto legivel. Ainda assim, cada sistema de recrutamento pode interpretar documentos de forma diferente." }),
	},
	{
		question: t({ id: "home.faq.pdf.question", message: "Posso exportar em PDF?" }),
		answer: t({ id: "home.faq.pdf.answer", message: "Sim. Pode exportar o curriculo em PDF mantendo o modelo e a formatacao escolhida." }),
	},
	{
		question: t({ id: "home.faq.privacy.question", message: "Os meus dados ficam privados?" }),
		answer: t({ id: "home.faq.privacy.answer", message: "Os dados ficam associados a sua conta e sao tratados de acordo com as politicas de privacidade da Parvagas. O utilizador mantem controlo sobre o conteudo do CV." }),
	},
	{
		question: t({ id: "home.faq.edit.question", message: "Posso editar o CV mais tarde?" }),
		answer: t({ id: "home.faq.edit.answer", message: "Sim. Pode voltar ao CV Builder, abrir os seus CVs e continuar a editar antes de exportar novamente." }),
	},
	{
		question: t({ id: "home.faq.guarantee.question", message: "O CV Builder garante emprego?" }),
		answer: t({ id: "home.faq.guarantee.answer", message: "Nao. O Parvagas CV Builder ajuda a criar e organizar curriculos, mas nao garante emprego, entrevistas ou contratacao." }),
	},
	{
		question: t({ id: "home.faq.plan.question", message: "Que funcionalidades dependem do meu plano?" }),
		answer: t({ id: "home.faq.plan.answer", message: "O Parvagas CV Builder inclui um plano gratuito e funcionalidades adicionais nos planos Pro e Premium. As funcionalidades disponiveis dependem do plano associado a conta Parvagas." }),
	},
	{
		question: t({ id: "home.faq.support.question", message: "Preciso de ajuda?" }),
		answer: (
			<Trans id="home.faq.support.answer">
				Fale com a equipa Parvagas{" "}
				<a
					href={supportUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={buttonVariants({ variant: "link", className: "h-auto px-0!" })}
				>
					atraves dos contactos oficiais
					<span className="sr-only"> (abre numa nova aba)</span>
				</a>
				.
			</Trans>
		),
	},
];

export function Faq() {
	const faqItems = getFaqItems();

	return (
		<section
			id="frequently-asked-questions"
			className="flex flex-col gap-x-16 gap-y-6 p-5 md:p-8 lg:flex-row lg:gap-x-18 xl:py-14"
		>
			<m.h2
				className={cn(
					"flex-1 font-semibold text-2xl tracking-tight will-change-[transform,opacity] md:text-4xl xl:text-5xl",
					"flex shrink-0 flex-wrap items-center gap-x-1.5 lg:flex-col lg:items-start",
				)}
				initial={{ opacity: 0, x: -20 }}
				whileInView={{ opacity: 1, x: 0 }}
				viewport={{ once: true }}
				transition={{ duration: 0.45 }}
			>
				<Trans id="home.faq.heading">
					<span>Perguntas</span>
					<span>Frequentes</span>
				</Trans>
			</m.h2>

			<m.div
				initial={{ opacity: 0, y: 20 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true }}
				transition={{ duration: 0.45, delay: 0.08 }}
				className="max-w-2xl flex-2 will-change-[transform,opacity] lg:ml-auto 2xl:max-w-3xl"
			>
				<Accordion multiple>
					{faqItems.map((item, index) => (
						<FAQItemComponent key={item.question} item={item} index={index} />
					))}
				</Accordion>
			</m.div>
		</section>
	);
}

type FAQItemComponentProps = {
	item: FAQItemData;
	index: number;
};

function FAQItemComponent({ item, index }: FAQItemComponentProps) {
	return (
		<m.div
			className="will-change-[transform,opacity] last:border-b"
			initial={{ opacity: 0, y: 10 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.24, delay: Math.min(0.16, index * 0.03) }}
		>
			<AccordionItem value={item.question} className="group border-t">
				<AccordionTrigger className="py-5">{item.question}</AccordionTrigger>
				<AccordionContent className="pb-5 text-muted-foreground leading-relaxed">{item.answer}</AccordionContent>
			</AccordionItem>
		</m.div>
	);
}
