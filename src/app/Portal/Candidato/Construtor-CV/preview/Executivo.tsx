"use client";

/**
 * Client-side mirror of resume_render_service.py's "executivo" template
 * (_EXECUTIVO_CSS): dark sidebar (contact/skills/languages/certifications)
 * + main column (summary/experience/education). Same "pré-visualização
 * aproximada" caveat as AtsClassic.
 */

import { formatRange, type PreviewData } from "./AtsClassic";

export default function Executivo({ data }: { data: PreviewData }) {
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
    <div className="mx-auto flex w-full max-w-[210mm] bg-white text-[13px] leading-snug shadow-sm" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      {/* Sidebar */}
      <div className="w-[34%] shrink-0 bg-slate-800 p-5 text-slate-200">
        <h1 className="text-xl font-bold text-white">{fullName}</h1>
        {title && <p className="mt-0.5 text-xs text-slate-400">{title}</p>}

        {contactParts.length > 0 && (
          <SideSection title="CONTACTO">
            {contactParts.map((part, i) => (
              <p key={i} className="break-words text-[11px] text-slate-300">{part}</p>
            ))}
          </SideSection>
        )}

        {(hardSkills.length > 0 || techniques.length > 0 || tools.length > 0) && (
          <SideSection title="COMPETÊNCIAS">
            {hardSkills.length > 0 && <p className="text-[11px] text-slate-300"><strong className="text-slate-100">Hard Skills:</strong> {hardSkills.join(", ")}</p>}
            {techniques.length > 0 && <p className="text-[11px] text-slate-300"><strong className="text-slate-100">Técnicas:</strong> {techniques.join(", ")}</p>}
            {tools.length > 0 && <p className="text-[11px] text-slate-300"><strong className="text-slate-100">Ferramentas:</strong> {tools.join(", ")}</p>}
          </SideSection>
        )}

        {languages.length > 0 && (
          <SideSection title="IDIOMAS">
            <p className="text-[11px] text-slate-300">{languages.join(", ")}</p>
          </SideSection>
        )}

        {certifications.length > 0 && (
          <SideSection title="CERTIFICAÇÕES">
            <ul className="list-disc pl-3">
              {certifications.map((cert, i) => (
                <li key={i} className="text-[11px] text-slate-300">{cert}</li>
              ))}
            </ul>
          </SideSection>
        )}
      </div>

      {/* Main column */}
      <div className="min-w-0 flex-1 p-5">
        {data.professionalSummary?.trim() && (
          <MainSection title="RESUMO PROFISSIONAL">
            <p className="text-[12.5px] text-slate-800">{data.professionalSummary}</p>
          </MainSection>
        )}

        {experience.length > 0 && (
          <MainSection title="EXPERIÊNCIA PROFISSIONAL">
            {experience.map((exp, i) => {
              const companyLoc = [exp.company, exp.location].filter(Boolean).join(", ");
              const range = formatRange(exp.startDate, exp.endDate, exp.current);
              return (
                <div key={i} className="mb-2">
                  <p className="text-[12.5px] font-bold text-slate-900">
                    {companyLoc}{range && <span className="font-normal text-slate-500"> — {range}</span>}
                  </p>
                  {exp.jobTitle && <p className="text-[12px] italic text-slate-500">{exp.jobTitle}</p>}
                  {exp.description?.trim() && (
                    <ul className="mt-0.5 list-disc pl-4">
                      {exp.description.split(". ").filter((s) => s.trim()).map((sentence, j) => (
                        <li key={j} className="text-[12.5px] text-slate-800">{sentence.trim().replace(/\.$/, "")}.</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </MainSection>
        )}

        {education.length > 0 && (
          <MainSection title="FORMAÇÃO ACADÉMICA">
            {education.map((edu, i) => {
              const instLoc = [edu.institution, edu.location].filter(Boolean).join(", ");
              const range = formatRange(edu.startDate, edu.endDate);
              return (
                <div key={i} className="mb-2">
                  <p className="text-[12.5px] font-bold text-slate-900">
                    {instLoc}{range && <span className="font-normal text-slate-500"> — {range}</span>}
                  </p>
                  {edu.degree && <p className="text-[12px] italic text-slate-500">{edu.degree}</p>}
                </div>
              );
            })}
          </MainSection>
        )}
      </div>
    </div>
  );
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="border-b border-slate-600 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-white">{title}</h2>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function MainSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="border-b border-slate-800 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-800">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
