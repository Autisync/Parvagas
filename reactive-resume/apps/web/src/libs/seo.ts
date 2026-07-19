import { branding, subscriptionDisclosure } from "./branding";

const productionRootUrl = "https://cv.parvagas.pt/";
const appName = branding.productName;
const repositoryUrl = branding.mainPlatformUrl;

type JsonLd = Record<string, unknown>;

export const getCanonicalRootUrl = (origin?: string): string => {
	if (!origin) return productionRootUrl;

	const url = new URL(origin);
	url.pathname = "/";
	url.search = "";
	url.hash = "";

	return url.toString();
};

export const createNoindexFollowMeta = () => ({ name: "robots", content: "noindex, follow" });

const serializeJsonLdForScript = (data: JsonLd) =>
	JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) => {
		switch (character) {
			case "<":
				return "\\u003C";
			case ">":
				return "\\u003E";
			case "&":
				return "\\u0026";
			case "\u2028":
				return "\\u2028";
			case "\u2029":
				return "\\u2029";
			default:
				return character;
		}
	});

const createStructuredDataScript = (id: string, data: JsonLd) => ({
	id,
	type: "application/ld+json",
	children: serializeJsonLdForScript(data),
});

export const getRootStructuredData = (canonicalUrl: string): JsonLd[] => [
	{
		"@type": "WebSite",
		name: appName,
		url: canonicalUrl,
	},
	{
		"@type": ["SoftwareApplication", "WebApplication"],
		name: appName,
		url: canonicalUrl,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		isAccessibleForFree: false,
		description: subscriptionDisclosure,
		codeRepository: repositoryUrl,
	},
	{
		"@type": "Project",
		name: appName,
		url: canonicalUrl,
		sameAs: [repositoryUrl],
	},
	{
		"@type": "FAQPage",
		mainEntity: homeFaqJsonLdItems.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	},
];

export const createRootStructuredDataScript = (canonicalUrl: string) =>
	createStructuredDataScript("parvagas-cv-builder-structured-data", {
		"@context": "https://schema.org",
		"@graph": getRootStructuredData(canonicalUrl),
	});

const homeFaqJsonLdItems = [
	{
		question: "O Parvagas CV Builder e gratuito?",
		answer: subscriptionDisclosure,
	},
	{
		question: "How is my data protected?",
		answer:
			"Your data is stored securely and processed according to Parvagas privacy and security standards.",
	},
	{
		question: "Can I export my resume to PDF?",
		answer:
			"Absolutely! You can export your resume to PDF with a single click. The exported PDF maintains all your formatting and styling perfectly.",
	},
	{
		question: "O Parvagas CV Builder suporta varios idiomas?",
		answer:
			"Sim. Pode escolher o idioma preferido nas definicoes do produto.",
	},
	{
		question: "O que diferencia o Parvagas CV Builder de outros construtores de CV?",
		answer:
			"O Parvagas CV Builder foi adaptado ao mercado local, integra com o ecossistema Parvagas e oferece suporte dedicado.",
	},
	{
		question: "How do I share my resume?",
		answer:
			"You can share your resume via a unique public URL, protect it with a password, or download it as a PDF to share directly. The choice is yours!",
	},
] as const;
