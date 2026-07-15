"use client";

import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";
import { apiFetchRaw } from "@/lib/api";

const initialFormData = {
  fullName: "",
  dateOfBirth: "",
  email: "",
  cellphoneContact: "",
  gender: "",
  qualification: "",
  profession: "",
  expirienceInOilGas: "",
  yearsOfExperience: "",
  residencialAddress: "",
  city: "",
  currentEmployer: "",
  nationality: "",
  personalStatement: "",
  "file-upload": "",
  "extrafile-upload": "",
};

const fieldClass =
  "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100";

const labelClass = "block text-sm font-semibold text-slate-800";

function FormSection({ eyebrow, title, description, children }) {
  return (
    <section className="border-t border-slate-200 pt-8">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">{eyebrow}</p>}
        <h2 className="mt-2 text-xl font-bold text-slate-950">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-6">{children}</div>
    </section>
  );
}

function UploadBox({ id, name, title, description, onChange, chooseFileLabel, dragDropLabel }) {
  return (
    <div className="col-span-full">
      <label htmlFor={id} className={labelClass}>
        {title}
      </label>
      <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-red-300 hover:bg-red-50/40">
        <DocumentArrowUpIcon className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1 text-sm text-slate-600">
          <label
            htmlFor={id}
            className="cursor-pointer rounded-lg bg-white px-3 py-2 font-semibold text-red-600 shadow-sm ring-1 ring-slate-200 transition hover:text-red-700"
          >
            {chooseFileLabel}
          </label>
          <span>{dragDropLabel}</span>
          <input id={id} name={name} type="file" onChange={onChange} className="sr-only" />
        </div>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function CVForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [primaryCvFile, setPrimaryCvFile] = useState(null);
  const [extraAttachment, setExtraAttachment] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ file: "" });
  const { locale } = useClientLocale();
  const t =
    locale === "en"
      ? {
          chooseFile: "Choose file",
          dragDrop: "or drag and drop",
          submitCv: "Submit CV",
          heroEyebrow: "Submit CV",
          heroTitle: "Share your professional profile.",
          heroDescription: "Complete key details so the Parvagas team can consider your profile for relevant opportunities.",
          heroPoint1: "Personal details and professional experience.",
          heroPoint2: "CV and documents in PDF or DOCX.",
          heroPoint3: "Consent for secure processing.",
          formEyebrow: "Spontaneous application",
          formTitle: "Send your CV today",
          formDescription: "Use updated information and valid contacts to help us follow up your application.",
          successMessage: "CV submitted successfully. The Parvagas team will review your information.",
          submitError: "Could not submit CV.",
          personalEyebrow: "Personal information",
          personalTitle: "Candidate details",
          personalDescription: "Use full name and permanent contacts for follow-up.",
          fullName: "Full name",
          dateOfBirth: "Date of birth",
          email: "Email",
          phone: "Phone contact",
          gender: "Gender",
          genderChoose: "Choose",
          genderMale: "Male",
          genderFemale: "Female",
          genderNonBinary: "Non-binary",
          genderPreferNot: "Prefer not to say",
          nationality: "Nationality",
          expEyebrow: "Experience",
          expTitle: "Professional profile",
          expDescription: "Help us understand your area, seniority, and availability.",
          qualification: "Academic qualification",
          qualificationSecondary: "High School",
          qualificationCertificate: "Certificate",
          qualificationTechnical: "Technical Course",
          qualificationAssociate: "Associate Degree",
          qualificationBachelor: "Bachelor",
          qualificationLicentiate: "Licentiate",
          qualificationMasters: "Master",
          qualificationDoctorate: "Doctorate",
          profession: "Profession",
          oilGasExperience: "Oil & Gas experience?",
          yes: "Yes",
          no: "No",
          yearsExperience: "Years of experience",
          currentEmployer: "Current employer",
          city: "City",
          address: "Address",
          statement: "Professional summary",
          statementPlaceholder: "Briefly explain why we should consider your profile.",
          docsEyebrow: "Documents",
          docsTitle: "CV and attachments",
          docsDescription: "Attach your main CV and, if needed, supporting documents.",
          cvTitle: "Curriculum Vitae",
          cvDescription: "PDF or DOCX up to 10MB.",
          otherDocsTitle: "Other documents",
          otherDocsDescription: "Certificates, cover letter, or relevant files.",
          legalTitle: "Legal authorization",
          legalBody: "I agree and authorize Parvagas to securely process the information provided, declaring it is true.",
          clear: "Clear",
          submitting: "Submitting...",
          requiredAttachment: "Attach your CV before submitting.",
        }
      : {
          chooseFile: "Escolher ficheiro",
          dragDrop: "ou arraste e solte",
          submitCv: "Submeter CV",
          heroEyebrow: "Submeter CV",
          heroTitle: "Partilhe o seu perfil profissional.",
          heroDescription: "Complete os dados essenciais para que a equipa Parvagas possa considerar o seu perfil em oportunidades relevantes.",
          heroPoint1: "Dados pessoais e experiência profissional.",
          heroPoint2: "CV e documentos em PDF ou DOCX.",
          heroPoint3: "Consentimento para processamento seguro.",
          formEyebrow: "Candidatura espontânea",
          formTitle: "Envie o seu CV hoje",
          formDescription: "Use informação atualizada e contactos válidos para facilitar o acompanhamento da candidatura.",
          successMessage: "CV submetido com sucesso. A equipa Parvagas irá analisar a informação.",
          submitError: "Não foi possível submeter o CV.",
          personalEyebrow: "Informação pessoal",
          personalTitle: "Dados do candidato",
          personalDescription: "Use o nome completo e contactos permanentes para acompanhamento.",
          fullName: "Nome completo",
          dateOfBirth: "Data de nascimento",
          email: "Email",
          phone: "Contacto telefónico",
          gender: "Sexo",
          genderChoose: "Escolha",
          genderMale: "Masculino",
          genderFemale: "Feminino",
          genderNonBinary: "Binário",
          genderPreferNot: "Prefiro não especificar",
          nationality: "Nacionalidade",
          expEyebrow: "Experiência",
          expTitle: "Perfil profissional",
          expDescription: "Ajude-nos a entender a sua área, senioridade e disponibilidade.",
          qualification: "Habilitação académica",
          qualificationSecondary: "Ensino Médio",
          qualificationCertificate: "Certificado",
          qualificationTechnical: "Curso Técnico",
          qualificationAssociate: "Grau de Associado",
          qualificationBachelor: "Bacharelado",
          qualificationLicentiate: "Licenciatura",
          qualificationMasters: "Mestrado",
          qualificationDoctorate: "Doutorado",
          profession: "Profissão",
          oilGasExperience: "Experiência em Oil & Gas?",
          yes: "Sim",
          no: "Não",
          yearsExperience: "Anos de experiência",
          currentEmployer: "Empregador atual",
          city: "Cidade",
          address: "Endereço físico",
          statement: "Resumo profissional",
          statementPlaceholder: "Explique brevemente por que devemos considerar o seu perfil.",
          docsEyebrow: "Documentos",
          docsTitle: "CV e anexos",
          docsDescription: "Anexe o CV principal e, se necessário, documentos de apoio.",
          cvTitle: "Curriculum Vitae",
          cvDescription: "PDF ou DOCX até 10MB.",
          otherDocsTitle: "Outros documentos",
          otherDocsDescription: "Certificados, carta de apresentação ou anexos relevantes.",
          legalTitle: "Autorização legal",
          legalBody: "Concordo e garanto à Parvagas a segurança e o processamento das informações fornecidas, declarando que são verdadeiras.",
          clear: "Limpar",
          submitting: "A submeter...",
          requiredAttachment: "Anexe o seu CV antes de submeter.",
        };

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;
    if (files?.[0]) {
      if (name === "file-upload") setPrimaryCvFile(files[0]);
      if (name === "extrafile-upload") setExtraAttachment(files[0]);
    }
    setFormData((current) => ({
      ...current,
      [name]: files?.[0]?.name ?? value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setStatus({ type: "", message: "" });
    setFieldErrors({ file: "" });

    if (!formData["file-upload"]) {
      setFieldErrors({ file: t.requiredAttachment });
      return;
    }

    setSubmitting(true);

    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (["file-upload", "extrafile-upload"].includes(key)) return;
        payload.append(key, String(value || ""));
      });
      if (primaryCvFile) payload.append("cv", primaryCvFile);
      if (extraAttachment) payload.append("extraDocument", extraAttachment);

      const response = await apiFetchRaw("/public/cv-submissions", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || body?.detail || t.submitError);
      }

      setStatus({ type: "success", message: t.successMessage });
      setFormData(initialFormData);
      setPrimaryCvFile(null);
      setExtraAttachment(null);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : t.submitError,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="submeter-cv" className="bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[0.8fr,1.2fr]">
          <aside className="bg-slate-950 p-8 text-white sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">{t.heroEyebrow}</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">{t.heroTitle}</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {t.heroDescription}
            </p>
            <div className="mt-10 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">{t.heroPoint1}</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">{t.heroPoint2}</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">{t.heroPoint3}</div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-8 p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">{t.formEyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{t.formTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t.formDescription}
              </p>
            </div>

            {status.message && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  status.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {status.message}
              </div>
            )}

            <FormSection
              eyebrow={t.personalEyebrow}
              title={t.personalTitle}
              description={t.personalDescription}
            >
              <div className="sm:col-span-3">
                <label htmlFor="fullName" className={labelClass}>{t.fullName}</label>
                <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleInputChange} autoComplete="name" className={fieldClass} required />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="dateOfBirth" className={labelClass}>{t.dateOfBirth}</label>
                <input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="email" className={labelClass}>{t.email}</label>
                <input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} autoComplete="email" className={fieldClass} required />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="cellphoneContact" className={labelClass}>{t.phone}</label>
                <input id="cellphoneContact" name="cellphoneContact" type="tel" value={formData.cellphoneContact} onChange={handleInputChange} autoComplete="tel" className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="gender" className={labelClass}>{t.gender}</label>
                <select id="gender" name="gender" value={formData.gender} onChange={handleInputChange} className={fieldClass}>
                  <option value="">{t.genderChoose}</option>
                  <option value="Masculino">{t.genderMale}</option>
                  <option value="Feminino">{t.genderFemale}</option>
                  <option value="Binario">{t.genderNonBinary}</option>
                  <option value="Prefiro nao Especificar">{t.genderPreferNot}</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="nationality" className={labelClass}>{t.nationality}</label>
                <input id="nationality" name="nationality" type="text" value={formData.nationality} onChange={handleInputChange} className={fieldClass} />
              </div>
            </FormSection>

            <FormSection
              eyebrow={t.expEyebrow}
              title={t.expTitle}
              description={t.expDescription}
            >
              <div className="sm:col-span-3">
                <label htmlFor="qualification" className={labelClass}>{t.qualification}</label>
                <select id="qualification" name="qualification" value={formData.qualification} onChange={handleInputChange} className={fieldClass}>
                  <option value="">{t.genderChoose}</option>
                  <option value="Ensino Médio">{t.qualificationSecondary}</option>
                  <option value="Certificado">{t.qualificationCertificate}</option>
                  <option value="Curso Técnico">{t.qualificationTechnical}</option>
                  <option value="Grau de Associado">{t.qualificationAssociate}</option>
                  <option value="Bacharelado">{t.qualificationBachelor}</option>
                  <option value="Licenciatura">{t.qualificationLicentiate}</option>
                  <option value="Mestrado">{t.qualificationMasters}</option>
                  <option value="Doutorado">{t.qualificationDoctorate}</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="profession" className={labelClass}>{t.profession}</label>
                <input id="profession" name="profession" type="text" value={formData.profession} onChange={handleInputChange} autoComplete="organization-title" className={fieldClass} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="expirienceInOilGas" className={labelClass}>{t.oilGasExperience}</label>
                <select id="expirienceInOilGas" name="expirienceInOilGas" value={formData.expirienceInOilGas} onChange={handleInputChange} className={fieldClass}>
                  <option value="">{t.genderChoose}</option>
                  <option value="true">{t.yes}</option>
                  <option value="false">{t.no}</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="yearsOfExperience" className={labelClass}>{t.yearsExperience}</label>
                <input id="yearsOfExperience" name="yearsOfExperience" type="number" min="0" value={formData.yearsOfExperience} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="currentEmployer" className={labelClass}>{t.currentEmployer}</label>
                <input id="currentEmployer" name="currentEmployer" type="text" value={formData.currentEmployer} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="city" className={labelClass}>{t.city}</label>
                <input id="city" name="city" type="text" value={formData.city} onChange={handleInputChange} autoComplete="address-level2" className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="residencialAddress" className={labelClass}>{t.address}</label>
                <input id="residencialAddress" name="residencialAddress" type="text" value={formData.residencialAddress} onChange={handleInputChange} autoComplete="street-address" className={fieldClass} />
              </div>

              <div className="col-span-full">
                <label htmlFor="personalStatement" className={labelClass}>{t.statement}</label>
                <textarea
                  id="personalStatement"
                  name="personalStatement"
                  rows={4}
                  value={formData.personalStatement}
                  onChange={handleInputChange}
                  className={fieldClass}
                  placeholder={t.statementPlaceholder}
                />
              </div>
            </FormSection>

            <FormSection eyebrow={t.docsEyebrow} title={t.docsTitle} description={t.docsDescription}>
              <UploadBox
                id="file-upload"
                name="file-upload"
                title={t.cvTitle}
                description={t.cvDescription}
                onChange={(event) => {
                  handleInputChange(event);
                  setFieldErrors((current) => ({ ...current, file: "" }));
                }}
                chooseFileLabel={t.chooseFile}
                dragDropLabel={t.dragDrop}
              />
              <FormFieldError id="file-upload-error" message={submitted ? fieldErrors.file : ""} />
              <UploadBox
                id="extrafile-upload"
                name="extrafile-upload"
                title={t.otherDocsTitle}
                description={t.otherDocsDescription}
                onChange={handleInputChange}
                chooseFileLabel={t.chooseFile}
                dragDropLabel={t.dragDrop}
              />
            </FormSection>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-bold text-slate-950">{t.legalTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t.legalBody}
              </p>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="reset"
                onClick={() => {
                  setFormData(initialFormData);
                  setStatus({ type: "", message: "" });
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                {t.clear}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t.submitting : t.submitCv}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
