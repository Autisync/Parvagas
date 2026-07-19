const getPublicEnv = (key: string, fallback: string) => {
	const value = typeof import.meta !== "undefined" ? String(import.meta.env?.[key] ?? "").trim() : "";
	return value || fallback;
};

export const cvBuilderBranding = {
	productName: "Parvagas CV Builder",
	companyName: "Parvagas",
	technologyPartner: "Autisync",
	productUrl: typeof window !== "undefined" ? window.location.origin : getPublicEnv("VITE_PUBLIC_CV_BUILDER_URL", "https://cv.parvagas.pt"),
	mainPlatformUrl: getPublicEnv("VITE_PARVAGAS_MAIN_URL", "https://parvagas.pt"),
	dashboardUrl: getPublicEnv("VITE_PARVAGAS_CANDIDATE_CV_URL", "https://parvagas.pt/Portal/Candidato/CV-e-Documentos"),
	supportEmail: "suporte@parvagas.pt",
	supportUrl: getPublicEnv("VITE_PARVAGAS_SUPPORT_URL", "https://parvagas.pt/contactos"),
	privacyUrl: getPublicEnv("VITE_PARVAGAS_PRIVACY_URL", "https://parvagas.pt/privacidade"),
	termsUrl: getPublicEnv("VITE_PARVAGAS_TERMS_URL", "https://parvagas.pt/termos"),
	technologyPartnerUrl: getPublicEnv("VITE_PUBLIC_AUTISYNC_URL", "https://www.autisync.com/"),
	mitLicenseUrl: "https://github.com/Heliotheanalyst/reactive-resume/blob/main/LICENSE",
} as const;

export const branding = cvBuilderBranding;

export const subscriptionDisclosure =
	"O Parvagas CV Builder inclui um plano gratuito e funcionalidades adicionais nos planos Pro e Premium. As funcionalidades disponiveis dependem do plano associado a conta Parvagas.";
