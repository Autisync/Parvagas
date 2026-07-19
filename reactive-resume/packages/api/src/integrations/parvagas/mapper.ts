import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { generateId } from "@reactive-resume/utils/string";
import type { ParvagasProfileResponse, ParvagasSectionSelection } from "./schemas";

const toPeriod = (startDate?: string, endDate?: string, current?: boolean) => {
	const start = startDate?.trim() ?? "";
	const end = current ? "Atual" : (endDate?.trim() ?? "");
	if (start && end) return `${start} - ${end}`;
	return start || end || "";
};

const toHtml = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return `<p>${trimmed}</p>`;
};

const toHighlightsHtml = (summary: string, highlights: string[]) => {
	const normalizedHighlights = highlights.map((item) => item.trim()).filter(Boolean);
	if (normalizedHighlights.length === 0) return toHtml(summary);

	const listItems = normalizedHighlights.map((item) => `<li><p>${item}</p></li>`).join("");
	const summaryHtml = summary.trim() ? `<p>${summary.trim()}</p>` : "";
	return `${summaryHtml}<ul>${listItems}</ul>`;
};

const toLevel = (value: number) => {
	if (Number.isNaN(value)) return 0;
	return Math.max(0, Math.min(5, Math.round(value)));
};

export function mapParvagasProfileToResumeData(
	profile: ParvagasProfileResponse,
	selection: ParvagasSectionSelection,
): ResumeData {
	const resume: ResumeData = structuredClone(defaultResumeData);

	if (selection.basics) {
		resume.basics.name = profile.basics.name;
		resume.basics.email = profile.basics.email;
		resume.basics.phone = profile.basics.phone;
		resume.basics.location = profile.basics.location;
		resume.basics.website = {
			label: profile.basics.website ? "Website" : "",
			url: profile.basics.website,
		};
	}

	resume.summary.hidden = !selection.summary;
	if (selection.summary) {
		resume.summary.content = toHtml(profile.summary);
	}

	resume.sections.experience.hidden = !selection.experience;
	if (selection.experience) {
		resume.sections.experience.items = profile.experience.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			company: item.company,
			position: item.position,
			location: item.location,
			period: toPeriod(item.startDate, item.endDate, item.current),
			website: { label: "", url: "", inlineLink: false },
			description: toHighlightsHtml(item.summary, item.highlights),
			roles: [],
		}));
	}

	resume.sections.education.hidden = !selection.education;
	if (selection.education) {
		resume.sections.education.items = profile.education.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			school: item.institution,
			degree: item.studyType,
			area: item.area,
			grade: item.score,
			location: "",
			period: toPeriod(item.startDate, item.endDate, item.current),
			website: { label: "", url: "", inlineLink: false },
			description: toHtml(item.summary),
		}));
	}

	resume.sections.skills.hidden = !selection.skills;
	if (selection.skills) {
		resume.sections.skills.items = profile.skills.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			icon: "",
			iconColor: "",
			name: item.name,
			proficiency: item.level > 0 ? `${item.level}/5` : "",
			level: toLevel(item.level),
			keywords: item.keywords,
		}));
	}

	resume.sections.languages.hidden = !selection.languages;
	if (selection.languages) {
		resume.sections.languages.items = profile.languages.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			language: item.name,
			fluency: item.fluency,
			level: 0,
		}));
	}

	resume.sections.certifications.hidden = !selection.certifications;
	if (selection.certifications) {
		resume.sections.certifications.items = profile.certifications.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			title: item.name,
			issuer: item.issuer,
			date: item.date ?? "",
			website: { label: "", url: item.url, inlineLink: false },
			description: toHtml(item.summary),
		}));
	}

	resume.sections.projects.hidden = !selection.projects;
	if (selection.projects) {
		resume.sections.projects.items = profile.projects.map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			name: item.name,
			period: toPeriod(item.startDate, item.endDate, false),
			website: { label: "", url: item.url, inlineLink: false },
			description: toHighlightsHtml(item.description, item.highlights),
		}));
	}

	resume.sections.profiles.hidden = !selection.links;
	if (selection.links) {
		const links = [
			...profile.links,
			...(profile.basics.linkedin ? [{ id: generateId(), network: "LinkedIn", username: "", url: profile.basics.linkedin }] : []),
			...(profile.basics.github ? [{ id: generateId(), network: "GitHub", username: "", url: profile.basics.github }] : []),
			...(profile.basics.portfolio ? [{ id: generateId(), network: "Portfolio", username: "", url: profile.basics.portfolio }] : []),
		];

		const uniqueByUrl = new Map<string, (typeof links)[number]>();
		for (const link of links) {
			const key = link.url.trim().toLowerCase();
			if (!key) continue;
			if (!uniqueByUrl.has(key)) uniqueByUrl.set(key, link);
		}

		resume.sections.profiles.items = Array.from(uniqueByUrl.values()).map((item) => ({
			id: item.id || generateId(),
			hidden: false,
			icon: "",
			iconColor: "",
			network: item.network || "Link",
			username: item.username || "",
			website: { label: item.network || "Link", url: item.url, inlineLink: false },
		}));
	}

	return resume;
}
