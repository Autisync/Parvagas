import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { fetchParvagasProfile } from "./client";
import { mapParvagasProfileToResumeData } from "./mapper";
import { parvagasSectionSelectionSchema, type ParvagasProfileResponse, type ParvagasSectionSelection } from "./schemas";

export async function loadParvagasProfile(userId: string): Promise<ParvagasProfileResponse> {
	return fetchParvagasProfile(userId);
}

export function buildResumeDataFromParvagasProfile(
	profile: ParvagasProfileResponse,
	selection: ParvagasSectionSelection,
): ResumeData {
	const parsedSelection = parvagasSectionSelectionSchema.parse(selection);
	const resume = mapParvagasProfileToResumeData(profile, parsedSelection);
	const sourceMap = {
		type: "parvagas-profile-import",
		externalUserId: profile.externalUserId,
		importedAt: new Date().toISOString(),
		sections: parsedSelection,
	};

	const notesBlock = `<p>Fonte: Perfil Parvagas (${sourceMap.externalUserId})</p><pre>${JSON.stringify(sourceMap)}</pre>`;
	resume.metadata.notes = [resume.metadata.notes, notesBlock].filter(Boolean).join("\n");
	return resume;
}
