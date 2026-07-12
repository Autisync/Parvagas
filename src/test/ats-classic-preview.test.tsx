import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AtsClassic from "@/app/Portal/Candidato/Construtor-CV/preview/AtsClassic";

describe("AtsClassic preview (EXECUTION_PLAN_NATIVE_CV_BUILDER.md A4)", () => {
  it("renders a placeholder name and no sections when data is empty", () => {
    render(<AtsClassic data={{}} />);
    expect(screen.getByText("Nome do Candidato")).toBeInTheDocument();
    expect(screen.queryByText("RESUMO PROFISSIONAL")).not.toBeInTheDocument();
    expect(screen.queryByText("EXPERIÊNCIA PROFISSIONAL")).not.toBeInTheDocument();
  });

  it("renders name, title, and joined contact line", () => {
    render(
      <AtsClassic
        data={{
          fullName: "Ana Sousa",
          professionalTitle: "Engenheira de Software",
          location: "Luanda",
          phone: "+244 900 000 000",
          email: "ana@example.com",
        }}
      />
    );
    expect(screen.getByText("Ana Sousa")).toBeInTheDocument();
    expect(screen.getByText("Engenheira de Software")).toBeInTheDocument();
    expect(screen.getByText("Luanda | +244 900 000 000 | ana@example.com")).toBeInTheDocument();
  });

  it("renders the professional summary section only when present", () => {
    render(<AtsClassic data={{ professionalSummary: "Resumo de teste." }} />);
    expect(screen.getByText("RESUMO PROFISSIONAL")).toBeInTheDocument();
    expect(screen.getByText("Resumo de teste.")).toBeInTheDocument();
  });

  it("renders work experience with company/location, date range, and bulleted description", () => {
    render(
      <AtsClassic
        data={{
          workExperience: [
            {
              company: "Acme",
              location: "Luanda",
              jobTitle: "Dev",
              startDate: "2020-01",
              endDate: "2023-06",
              description: "Geri uma equipa de 5. Entreguei o projeto no prazo.",
            },
          ],
        }}
      />
    );
    expect(screen.getByText("EXPERIÊNCIA PROFISSIONAL")).toBeInTheDocument();
    expect(screen.getByText(/Acme, Luanda/)).toBeInTheDocument();
    expect(screen.getByText(/01\/2020 – 06\/2023/)).toBeInTheDocument();
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Geri uma equipa de 5.")).toBeInTheDocument();
    expect(screen.getByText("Entreguei o projeto no prazo.")).toBeInTheDocument();
  });

  it("shows 'Presente' for a current position with no end date", () => {
    render(
      <AtsClassic
        data={{
          workExperience: [
            { company: "Acme", startDate: "2022-01", current: true },
          ],
        }}
      />
    );
    expect(screen.getByText(/Presente/)).toBeInTheDocument();
  });

  it("renders education entries", () => {
    render(
      <AtsClassic
        data={{
          education: [
            { institution: "UAN", location: "Luanda", degree: "Licenciatura em Informática", startDate: "2015-09", endDate: "2019-07" },
          ],
        }}
      />
    );
    expect(screen.getByText("FORMAÇÃO ACADÉMICA")).toBeInTheDocument();
    expect(screen.getByText(/UAN, Luanda/)).toBeInTheDocument();
    expect(screen.getByText("Licenciatura em Informática")).toBeInTheDocument();
  });

  it("renders the three skill buckets with their labels", () => {
    render(
      <AtsClassic
        data={{
          hardSkills: ["Python"],
          techniques: ["Scrum"],
          tools: ["Docker"],
        }}
      />
    );
    expect(screen.getByText("COMPETÊNCIAS")).toBeInTheDocument();
    expect(screen.getByText("Hard Skills:")).toBeInTheDocument();
    expect(screen.getByText("Técnicas:")).toBeInTheDocument();
    expect(screen.getByText("Ferramentas:")).toBeInTheDocument();
    expect(screen.getByText(/Python/)).toBeInTheDocument();
  });

  it("renders languages and certifications sections independently", () => {
    render(<AtsClassic data={{ languages: ["Português", "Inglês"], certifications: ["AWS Certified"] }} />);
    expect(screen.getByText("IDIOMAS")).toBeInTheDocument();
    expect(screen.getByText("Português, Inglês")).toBeInTheDocument();
    expect(screen.getByText("CERTIFICAÇÕES")).toBeInTheDocument();
    expect(screen.getByText("AWS Certified")).toBeInTheDocument();
  });

  it("never crashes on a fully empty or malformed-ish data object", () => {
    expect(() => render(<AtsClassic data={{ workExperience: undefined, education: undefined }} />)).not.toThrow();
  });
});
