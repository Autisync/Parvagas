// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

type LocaleComboboxProps = {
	render?: React.ReactElement;
};

vi.stubGlobal("__APP_VERSION__", "9.9.9");
vi.mock("@/features/locale/combobox", () => ({
	LocaleCombobox: ({ render }: LocaleComboboxProps) => render ?? <div data-testid="locale-combobox" />,
}));

// The footer module evaluates `socialLinks = [{ label: t`...`, ... }]` at module
// scope. That `t` call needs an activated locale BEFORE the import, so do that
// here instead of in beforeAll.
i18n.loadAndActivate({ locale: "en", messages: {} });

const { Footer } = await import("./footer");

const renderFooter = () =>
	render(
		<I18nProvider i18n={i18n}>
			<Footer />
		</I18nProvider>,
	);

describe("Footer", () => {
	it("renders Parvagas support and legal link group headings", () => {
		renderFooter();
		expect(screen.getByText("Parvagas")).toBeInTheDocument();
		expect(screen.getByText("Suporte")).toBeInTheDocument();
		expect(screen.getByText("Legal")).toBeInTheDocument();
	});

	it("renders the platform links", () => {
		const { container } = renderFooter();
		const text = container.textContent ?? "";
		for (const label of ["Voltar ao Parvagas", "Candidatos", "Empresas"]) {
			expect(text, label).toContain(label);
		}
	});

	it("renders the support and legal links", () => {
		const { container } = renderFooter();
		const text = container.textContent ?? "";
		for (const label of ["Contactos", "Suporte", "Portal do candidato", "Privacidade", "Termos", "Licenca MIT"]) {
			expect(text, label).toContain(label);
		}
	});

	it("renders Autisync and MIT attribution", () => {
		const { container } = renderFooter();
		const text = container.textContent ?? "";
		expect(text).toContain("Plataforma tecnologica concebida e desenvolvida pela Autisync");
		expect(text).toContain("Baseado no projeto open-source Reactive Resume");
	});
});
