import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LegalMarkdown from "@/app/components/legal/LegalMarkdown";

describe("LegalMarkdown", () => {
  it("renders headings, bold text, and paragraphs", () => {
    render(<LegalMarkdown markdown={"## 1. Secção\n\nTexto com **destaque** aqui."} />);
    expect(screen.getByRole("heading", { level: 2, name: "1. Secção" })).toBeInTheDocument();
    expect(screen.getByText("destaque")).toBeInTheDocument();
  });

  it("renders a GFM table with header and body cells", () => {
    const md = "| Tipo | Prazo |\n|---|---|\n| Conta ativa | 2 anos |";
    render(<LegalMarkdown markdown={md} />);
    expect(screen.getByRole("columnheader", { name: "Tipo" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Conta ativa" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2 anos" })).toBeInTheDocument();
  });

  it("renders an internal cross-reference link via next/link", () => {
    render(<LegalMarkdown markdown={"Ver a [Política de Privacidade](/privacidade) para mais detalhes."} />);
    const link = screen.getByRole("link", { name: "Política de Privacidade" });
    expect(link).toHaveAttribute("href", "/privacidade");
  });

  it("renders a mailto link as-is", () => {
    render(<LegalMarkdown markdown={"Contacte [privacidade@parvagas.pt](mailto:privacidade@parvagas.pt)."} />);
    const link = screen.getByRole("link", { name: "privacidade@parvagas.pt" });
    expect(link).toHaveAttribute("href", "mailto:privacidade@parvagas.pt");
  });

  it("drops an unsafe javascript: link but keeps the visible text", () => {
    render(<LegalMarkdown markdown={"[clique aqui](javascript:alert(1))"} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("clique aqui")).toBeInTheDocument();
  });

  it("renders a blockquote (used by the dispute-response template document)", () => {
    render(<LegalMarkdown markdown={"> Assunto: Recebemos a sua reclamação\n>\n> Olá {{nome_utilizador}},"} />);
    expect(screen.getByText(/Recebemos a sua reclamação/)).toBeInTheDocument();
  });

  it("renders a bullet list", () => {
    render(<LegalMarkdown markdown={"- Primeiro item\n- Segundo item"} />);
    expect(screen.getByText("Primeiro item")).toBeInTheDocument();
    expect(screen.getByText("Segundo item")).toBeInTheDocument();
  });
});
