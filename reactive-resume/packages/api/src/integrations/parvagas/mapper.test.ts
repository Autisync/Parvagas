import { describe, expect, it } from "vitest";
import { mapParvagasProfileToResumeData } from "./mapper";
import type { ParvagasProfileResponse, ParvagasSectionSelection } from "./schemas";

const profile: ParvagasProfileResponse = {
	externalUserId: "user-123",
	basics: {
		name: "Ana Silva",
		email: "ana@parvagas.pt",
		phone: "+244900000000",
		location: "Luanda",
		website: "https://ana.example",
		linkedin: "https://linkedin.com/in/ana",
		github: "",
		portfolio: "",
	},
	summary: "Profissional de RH",
	experience: [
		{
			id: "exp-1",
			company: "Empresa X",
			position: "Gestora de RH",
			location: "Luanda",
			startDate: "2020-01",
			endDate: "",
			current: true,
			summary: "Coordenação de equipa",
			highlights: ["Liderou 6 recrutadores"],
		},
	],
	education: [],
	skills: [{ id: "skill-1", name: "Gestão", level: 4, keywords: ["liderança"] }],
	languages: [{ id: "lang-1", name: "Português", fluency: "Nativo" }],
	certifications: [],
	projects: [],
	links: [{ id: "lnk-1", network: "Website", username: "", url: "https://ana.example" }],
};

const allSections: ParvagasSectionSelection = {
	basics: true,
	summary: true,
	experience: true,
	education: true,
	skills: true,
	languages: true,
	certifications: true,
	projects: true,
	links: true,
};

describe("mapParvagasProfileToResumeData", () => {
	it("maps selected profile fields to resume data", () => {
		const data = mapParvagasProfileToResumeData(profile, allSections);

		expect(data.basics.name).toBe("Ana Silva");
		expect(data.basics.phone).toBe("+244900000000");
		expect(data.summary.content).toContain("Profissional de RH");
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]?.period).toContain("Atual");
		expect(data.sections.skills.items[0]?.level).toBe(4);
		expect(data.sections.languages.items[0]?.language).toBe("Português");
		expect(data.sections.profiles.items.length).toBeGreaterThan(0);
	});

	it("respects section selection switches", () => {
		const data = mapParvagasProfileToResumeData(profile, { ...allSections, experience: false, links: false });
		expect(data.sections.experience.hidden).toBe(true);
		expect(data.sections.profiles.hidden).toBe(true);
	});
});
