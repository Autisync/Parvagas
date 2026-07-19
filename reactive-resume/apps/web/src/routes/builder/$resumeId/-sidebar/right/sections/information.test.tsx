// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

type SectionBaseProps = {
	children: React.ReactNode;
};

vi.mock("../shared/section-base", () => ({
	SectionBase: ({ children }: SectionBaseProps) => <div>{children}</div>,
}));

const { InformationSectionBuilder } = await import("./information");

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

const renderInfo = () =>
	render(
		<I18nProvider i18n={i18n}>
			<InformationSectionBuilder />
		</I18nProvider>,
	);

describe("InformationSectionBuilder", () => {
	it("renders the support prompt and CTA", () => {
		renderInfo();
		expect(screen.getByText("Need help with Parvagas CV Builder?")).toBeInTheDocument();
		expect(screen.getByText("Contactar suporte Parvagas")).toBeInTheDocument();
	});

	it("links the CTA to Parvagas support", () => {
		renderInfo();
		const supportLink = screen.getByText("Contactar suporte Parvagas").closest("a");
		expect(supportLink?.getAttribute("href")).toBe("mailto:suporte@parvagas.pt");
	});

	it("includes external resource links for terms, privacy and support", () => {
		renderInfo();
		const labels = ["Documentation", "Terms", "Report a Bug", "Privacy", "Parvagas Website"];
		for (const label of labels) {
			expect(screen.getByText(label).closest("a"), label).not.toBeNull();
		}
	});

	it("opens external links in a new tab", () => {
		renderInfo();
		const docs = screen.getByText("Documentation").closest("a") as HTMLAnchorElement;
		expect(docs.getAttribute("target")).toBe("_blank");
		expect(docs.getAttribute("rel")).toBe("noopener noreferrer");
	});
});
