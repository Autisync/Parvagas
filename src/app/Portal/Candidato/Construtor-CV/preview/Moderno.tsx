"use client";

/**
 * Client-side mirror of resume_render_service.py's "moderno" template
 * (_MODERNO_CSS): single column, left-aligned header, red accent bar on
 * section headings. Same "pré-visualização aproximada" caveat as AtsClassic
 * until the flag-gated preview.html iframe path takes over.
 */

import { formatRange, type PreviewData } from "./AtsClassic";

export default function Moderno({ data }: { data: PreviewData }) {
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
      <h1 className="text-3xl font-bold text-slate-900">{fullName}</h1>
      {title && <p className="mt-0.5 text-sm font-bold text-red-600">{title}</p>}
      {contactParts.length > 0 && (
        <p className="mt-0.5 text-xs text-slate-500">{contactParts.join("  |  ")}</p>
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
                  {companyLoc}{range && <span className="font-normal text-slate-500"> — {range}</span>}
                </p>
                {exp.jobTitle && <p className="text-[12px] text-red-600">{exp.jobTitle}</p>}
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
                  {instLoc}{range && <span className="font-normal text-slate-500"> — {range}</span>}
                </p>
                {edu.degree && <p className="text-[12px] text-red-600">{edu.degree}</p>}
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
      <h2 className="border-l-4 border-red-600 pl-2 text-[11px] font-bold uppercase tracking-widest text-slate-900">{title}</h2>
      <div className="mt-1">{children}</div>
    </div>
  );
}
