import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResumePreview from "@/app/Portal/Candidato/Construtor-CV/preview/ResumePreview";

const DATA = {
  fullName: "Ana Sousa",
  professionalTitle: "Engenheira de Software",
  location: "Luanda",
  phone: "+244 900 000 000",
  email: "ana@example.com",
  professionalSummary: "Resumo de teste.",
  workExperience: [
    { company: "Acme", location: "Luanda", jobTitle: "Dev", startDate: "2020-01", endDate: "2023-06", description: "Fiz coisas." },
  ],
  education: [{ institution: "UAN", degree: "Licenciatura", startDate: "2015-09", endDate: "2019-07" }],
  hardSkills: ["Python"],
  languages: ["Português"],
  certifications: ["AWS Certified"],
};

describe("ResumePreview template dispatcher (EXECUTION_PLAN_NATIVE_CV_BUILDER.md B2)", () => {
  it("renders ats-classic by default (null/unknown slug)", () => {
    const { container: byNull } = render(<ResumePreview data={DATA} templateSlug={null} />);
    expect(byNull.querySelector("h1")?.textContent).toBe("Ana Sousa");
    const { container: byUnknown } = render(<ResumePreview data={DATA} templateSlug="nao-existe" />);
    expect(byUnknown.innerHTML).toBe(byNull.innerHTML);
  });

  it("moderno renders all sections with its own styling, distinct from classic", () => {
    const { container } = render(<ResumePreview data={DATA} templateSlug="moderno" />);
    expect(container.textContent).toContain("Ana Sousa");
    expect(container.textContent).toContain("EXPERIÊNCIA PROFISSIONAL");
    expect(container.textContent).toContain("FORMAÇÃO ACADÉMICA");
    expect(container.textContent).toContain("AWS Certified");
    expect(container.querySelector(".border-red-600")).not.toBeNull(); // moderno's accent bar
    const { container: classic } = render(<ResumePreview data={DATA} templateSlug={null} />);
    expect(container.innerHTML).not.toBe(classic.innerHTML);
  });

  it("executivo renders sidebar (contact/skills) and main column (experience)", () => {
    const { container } = render(<ResumePreview data={DATA} templateSlug="executivo" />);
    expect(container.querySelector(".bg-slate-800")).not.toBeNull(); // dark sidebar
    expect(screen.getByText("CONTACTO")).toBeInTheDocument();
    expect(screen.getByText("+244 900 000 000")).toBeInTheDocument(); // individual parts, not joined line
    expect(screen.getByText("EXPERIÊNCIA PROFISSIONAL")).toBeInTheDocument();
    expect(screen.getByText("AWS Certified")).toBeInTheDocument();
  });

  it("all three templates survive an empty data object", () => {
    for (const slug of [null, "moderno", "executivo"]) {
      expect(() => render(<ResumePreview data={{}} templateSlug={slug} />)).not.toThrow();
    }
  });
});
