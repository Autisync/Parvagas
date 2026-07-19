import { describe, expect, it } from "vitest";
import {
	createNoindexFollowMeta,
	createRootStructuredDataScript,
	getCanonicalRootUrl,
	getRootStructuredData,
} from "./seo";

describe("getCanonicalRootUrl", () => {
	it("uses the production root when no origin is available", () => {
		expect(getCanonicalRootUrl()).toBe("https://cv.parvagas.pt/");
	});

	it("normalizes an app origin to the root URL", () => {
		expect(getCanonicalRootUrl("http://localhost:3000")).toBe("http://localhost:3000/");
		expect(getCanonicalRootUrl("https://cv.parvagas.pt/")).toBe("https://cv.parvagas.pt/");
	});
});

describe("createNoindexFollowMeta", () => {
	it("returns the robots noindex metadata used by private app surfaces", () => {
		expect(createNoindexFollowMeta()).toEqual({ name: "robots", content: "noindex, follow" });
	});
});

describe("createRootStructuredDataScript", () => {
	it("serializes JSON-LD using the structured data script id", () => {
		const script = createRootStructuredDataScript("https://cv.parvagas.pt/");

		expect(script.id).toBe("parvagas-cv-builder-structured-data");
		expect(script.type).toBe("application/ld+json");
		expect(JSON.parse(script.children)).toMatchObject({ "@context": "https://schema.org" });
	});

	it("escapes script-breaking sequences in JSON-LD children", () => {
		const script = createRootStructuredDataScript("https://cv.parvagas.pt/</script><!---->\u2028\u2029");

		expect(script.children).not.toContain("</script");
		expect(script.children).not.toContain("<!--");
		expect(script.children).not.toContain("\u2028");
		expect(script.children).not.toContain("\u2029");
		expect(script.children).toContain("\\u003C/script");
		expect(script.children).toContain("\\u003C!--");
		expect(script.children).toContain("\\u2028");
		expect(script.children).toContain("\\u2029");
	});
});

describe("getRootStructuredData", () => {
	it("describes only conservative visible product facts", () => {
		const schemas = getRootStructuredData("https://cv.parvagas.pt/");

		expect(schemas).toHaveLength(4);
		expect(schemas[0]).toMatchObject({
			"@type": "WebSite",
			name: "Parvagas CV Builder",
			url: "https://cv.parvagas.pt/",
		});
		expect(schemas[1]).toMatchObject({
			"@type": ["SoftwareApplication", "WebApplication"],
			name: "Parvagas CV Builder",
			applicationCategory: "BusinessApplication",
			operatingSystem: "Web",
			isAccessibleForFree: false,
		});
		expect(schemas[3]).toMatchObject({
			"@type": "FAQPage",
			mainEntity: expect.arrayContaining([
				expect.objectContaining({
					name: "O Parvagas CV Builder e gratuito?",
				}),
			]),
		});
	});
});
