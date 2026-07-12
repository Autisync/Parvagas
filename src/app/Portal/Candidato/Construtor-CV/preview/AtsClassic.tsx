"use client";

/**
 * Client-side HTML/CSS render of Resume.data, matching
 * backend-python/app/services/cv_export_service.py's to_pdf() layout as
 * closely as practical (section order, labels, colors) — NOT pixel-perfect
 * (reportlab's typography engine differs from CSS), which is why the editor
 * shows "pré-visualização aproximada" alongside this. Phase B's WeasyPrint
 * templates will close this gap by rendering the same HTML/CSS for both
 * the preview AND the PDF (see EXECUTION_PLAN_NATIVE_CV_BUILDER.md B1).
 */

type ExperienceItem = {
  jobTitle?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
};

type EducationItem = {
  degree?: string;
  institution?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
};

type PreviewData = {
  fullName?: string;
  professionalTitle?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  professionalSummary?: string;
  workExperience?: ExperienceItem[];
  education?: EducationItem[];
  hardSkills?: string[];
  techniques?: string[];
  tools?: string[];
  languages?: string[];
  certifications?: string[];
  [key: string]: unknown;
};

function formatMonth(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match) return `${match[2]}/${match[1]}`;
  return value;
}

function formatRange(start?: string, end?: string, current?: boolean): string {
  const s = formatMonth(start);
  const e = current || !end ? "Presente" : formatMonth(end);
  if (!s && !e) return "";
  if (!s) return e;
  if (e === "Presente" && !current && !end) return s;
  return `${s} – ${e}`;
}

export default function AtsClassic({ data }: { data: PreviewData }) {
  const fullName = data.fullName?.trim() || "Nome do Candidato";
  const title = (data.professionalTitle || data.jobTitle || "").trim();
  const contactParts = [data.location, data.phone, data.email, data.linkedinUrl].filter(Boolean) as string[];

  const experience = data.workExperience || [];
  const education = data.education || [];
  const hardSkills = data.hardSkills || [];
  const techniques = data.techniques || [];
  const tools = data.tools || [];
  const languages = data.languages || [];
  const certifications = data.certifications || [];

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] leading-snug text-slate-800 shadow-sm" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <h1 className="text-center text-2xl font-bold" style={{ color: "#1a1a2e" }}>{fullName}</h1>
      {title && <p className="mt-1 text-center text-sm" style={{ color: "#555555" }}>{title}</p>}
      {contactParts.length > 0 && (
        <p className="mt-1 text-center text-xs" style={{ color: "#555555" }}>{contactParts.join("  |  ")}</p>
      )}

      {data.professionalSummary?.trim() && (
        <Section title="RESUMO PROFISSIONAL">
          <p className="text-[12.5px]">{data.professionalSummary}</p>
        </Section>
      )}

      {experience.length > 0 && (
        <Section title="EXPERIÊNCIA PROFISSIONAL">
          {experience.map((exp, i) => {
            const companyLoc = [exp.company, exp.location].filter(Boolean).join(", ");
            const range = formatRange(exp.startDate, exp.endDate, exp.current);
            return (
              <div key={i} className="mb-2">
                <p className="text-[12.5px] font-bold text-slate-900">
                  {companyLoc}{range && <span className="font-normal text-slate-600"> — {range}</span>}
                </p>
                {exp.jobTitle && <p className="text-[12px] italic" style={{ color: "#555555" }}>{exp.jobTitle}</p>}
                {exp.description?.trim() && (
                  <ul className="mt-0.5 list-disc pl-4">
                    {exp.description.split(". ").filter((s) => s.trim()).map((sentence, j) => (
                      <li key={j} className="text-[12.5px]">{sentence.trim().replace(/\.$/, "")}.</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {education.length > 0 && (
        <Section title="FORMAÇÃO ACADÉMICA">
          {education.map((edu, i) => {
            const instLoc = [edu.institution, edu.location].filter(Boolean).join(", ");
            const range = formatRange(edu.startDate, edu.endDate);
            return (
              <div key={i} className="mb-2">
                <p className="text-[12.5px] font-bold text-slate-900">
                  {instLoc}{range && <span className="font-normal text-slate-600"> — {range}</span>}
                </p>
                {edu.degree && <p className="text-[12px] italic" style={{ color: "#555555" }}>{edu.degree}</p>}
              </div>
            );
          })}
        </Section>
      )}

      {(hardSkills.length > 0 || techniques.length > 0 || tools.length > 0) && (
        <Section title="COMPETÊNCIAS">
          {hardSkills.length > 0 && <p className="text-[12.5px]"><strong>Hard Skills:</strong> {hardSkills.join(", ")}</p>}
          {techniques.length > 0 && <p className="text-[12.5px]"><strong>Técnicas:</strong> {techniques.join(", ")}</p>}
          {tools.length > 0 && <p className="text-[12.5px]"><strong>Ferramentas:</strong> {tools.join(", ")}</p>}
        </Section>
      )}

      {languages.length > 0 && (
        <Section title="IDIOMAS">
          <p className="text-[12.5px]">{languages.join(", ")}</p>
        </Section>
      )}

      {certifications.length > 0 && (
        <Section title="CERTIFICAÇÕES">
          <ul className="list-disc pl-4">
            {certifications.map((cert, i) => (
              <li key={i} className="text-[12.5px]">{cert}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="text-[11px] font-bold tracking-wide" style={{ color: "#8B0000" }}>{title}</h2>
      <hr className="my-1" style={{ borderColor: "#CCCCCC" }} />
      {children}
    </div>
  );
}
