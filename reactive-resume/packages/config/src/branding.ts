export type BrandingConfig = {
	productName: string;
	companyName: string;
	technologyPartner: string;
	productUrl: string;
	mainPlatformUrl: string;
	supportEmail: string;
	supportUrl: string;
	privacyUrl: string;
	termsUrl: string;
	autisyncUrl: string;
};

export const defaultBranding: BrandingConfig = {
	productName: "Parvagas CV Builder",
	companyName: "Parvagas",
	technologyPartner: "Autisync",
	productUrl: "https://cv.parvagas.pt",
	mainPlatformUrl: "https://parvagas.pt",
	supportEmail: "suporte@parvagas.pt",
	supportUrl: "https://parvagas.pt/contactos",
	privacyUrl: "https://parvagas.pt/Privacidade",
	termsUrl: "https://parvagas.pt/Termos",
	autisyncUrl: "https://www.autisync.com/",
};

export function createBranding(overrides: Partial<BrandingConfig> = {}): BrandingConfig {
	return { ...defaultBranding, ...overrides };
}
