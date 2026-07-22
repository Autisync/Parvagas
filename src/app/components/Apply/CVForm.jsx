"use client";

import { CheckCircleIcon, DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";
import { apiFetchRaw } from "@/lib/api";

const initialFormData = {
  fullName: "",
  email: "",
  cellphoneContact: "",
  city: "",
  personalStatement: "",
  "file-upload": "",
};

const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file, t) {
  const lowerName = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) return t.invalidFileType;
  if (file.size > MAX_FILE_BYTES) return t.fileTooLarge;
  return "";
}

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

function UploadBox({ id, name, title, description, file, onFileSelected, onFileCleared, chooseFileLabel, dragDropLabel, removeLabel }) {
  const [isDragging, setIsDragging] = useState(false);

  const boxClass = file
    ? "mt-2 rounded-2xl border border-emerald-300 bg-emerald-50/60 px-6 py-8 text-center transition"
    : isDragging
    ? "mt-2 rounded-2xl border border-red-300 bg-red-50/60 px-6 py-8 text-center transition"
    : "mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-red-300 hover:bg-red-50/40";

  return (
    <div className="col-span-full">
      <label htmlFor={id} className={labelClass}>
        {title}
      </label>
      <div
        className={boxClass}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) onFileSelected(dropped);
        }}
      >
        {file ? (
          <>
            <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-800">
              <span className="max-w-xs truncate font-semibold">{file.name}</span>
              <span className="text-slate-500">({formatFileSize(file.size)})</span>
              <button
                type="button"
                onClick={onFileCleared}
                className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                aria-label={removeLabel}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <DocumentArrowUpIcon className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1 text-sm text-slate-600">
              <label
                htmlFor={id}
                className="cursor-pointer rounded-lg bg-white px-3 py-2 font-semibold text-red-600 shadow-sm ring-1 ring-slate-200 transition hover:text-red-700"
              >
                {chooseFileLabel}
              </label>
              <span>{dragDropLabel}</span>
            </div>
          </>
        )}
        <input
          id={id}
          name={name}
          type="file"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) onFileSelected(picked);
            // Reset so re-choosing the same filename after "Remover" still fires onChange.
            event.target.value = "";
          }}
          className="sr-only"
        />
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function CVForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [primaryCvFile, setPrimaryCvFile] = useState(null);
  const [legalConsent, setLegalConsent] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ file: "", consent: "" });
  const { locale } = useClientLocale();
  const t =
    locale === "en"
      ? {
          chooseFile: "Choose file",
          dragDrop: "or drag and drop",
          submitCv: "Submit CV",
          heroEyebrow: "Express interest",
          heroTitle: "Get on our radar for future openings.",
          heroDescription: "Leave your CV with us — we'll keep it on file and reach out when a relevant opportunity comes up, even if nothing fits today.",
          heroPoint1: "Takes under a minute.",
          heroPoint2: "CV in PDF or DOCX.",
          heroPoint3: "Consent for secure processing.",
          formEyebrow: "Expression of interest",
          formTitle: "Leave your CV with us",
          formDescription: "Just the essentials — we'll parse your CV for the rest. We'll email you a link to set a password so you can log back in and track your profile later.",
          successMessage: "Thanks! We received your CV and will reach out about relevant openings. Check your email to set a password and access your profile.",
          submitError: "Could not submit CV.",
          personalEyebrow: "Personal information",
          personalTitle: "Your details",
          personalDescription: "So we can create your profile and reach you.",
          fullName: "Full name",
          email: "Email",
          phone: "Phone contact (optional)",
          city: "City",
          statement: "What kind of opportunities are you looking for?",
          statementPlaceholder: "E.g. engineering roles, sales, available immediately… (optional)",
          docsEyebrow: "Documents",
          docsTitle: "Your CV",
          docsDescription: "Attach your CV — we'll extract the rest automatically.",
          cvTitle: "Curriculum Vitae",
          cvDescription: "PDF or DOCX up to 10MB.",
          legalTitle: "Legal authorization",
          legalBody: "I agree and authorize Parvagas to securely process the information provided, declaring it is true.",
          legalCheckboxLabel: "I have read and agree to the statement above.",
          requiredConsent: "You must confirm the legal authorization before submitting.",
          clear: "Clear",
          submitting: "Submitting...",
          requiredAttachment: "Attach your CV before submitting.",
          removeFile: "Remove file",
          invalidFileType: "Invalid file type. Use PDF, DOC, or DOCX.",
          fileTooLarge: "File is too large. Maximum size: 10MB.",
        }
      : {
          chooseFile: "Escolher ficheiro",
          dragDrop: "ou arraste e solte",
          submitCv: "Submeter CV",
          heroEyebrow: "Manifestação de interesse",
          heroTitle: "Fique no nosso radar para futuras oportunidades.",
          heroDescription: "Deixe o seu CV connosco — mantemos o seu perfil em análise e entramos em contacto quando surgir uma oportunidade relevante, mesmo que agora não haja nenhuma vaga certa.",
          heroPoint1: "Leva menos de um minuto.",
          heroPoint2: "CV em PDF ou DOCX.",
          heroPoint3: "Consentimento para processamento seguro.",
          formEyebrow: "Manifestação de interesse",
          formTitle: "Deixe o seu CV connosco",
          formDescription: "Só o essencial — o resto extraímos automaticamente do seu CV. Enviaremos um email com um link para definir uma password e poder acompanhar o seu perfil mais tarde.",
          successMessage: "Obrigado! Recebemos o seu CV e entraremos em contacto sobre oportunidades relevantes. Verifique o seu email para definir uma password e aceder ao seu perfil.",
          submitError: "Não foi possível submeter o CV.",
          personalEyebrow: "Informação pessoal",
          personalTitle: "Os seus dados",
          personalDescription: "Para criarmos o seu perfil e podermos contactá-lo.",
          fullName: "Nome completo",
          email: "Email",
          phone: "Contacto telefónico (opcional)",
          city: "Cidade",
          statement: "Que tipo de oportunidades procura?",
          statementPlaceholder: "Ex: vagas de engenharia, área comercial, disponibilidade imediata… (opcional)",
          docsEyebrow: "Documento",
          docsTitle: "O seu CV",
          docsDescription: "Anexe o seu CV — extraímos o resto automaticamente.",
          cvTitle: "Curriculum Vitae",
          cvDescription: "PDF ou DOCX até 10MB.",
          legalTitle: "Autorização legal",
          legalBody: "Concordo e garanto à Parvagas a segurança e o processamento das informações fornecidas, declarando que são verdadeiras.",
          legalCheckboxLabel: "Li e concordo com a declaração acima.",
          requiredConsent: "Tem de confirmar a autorização legal antes de submeter.",
          clear: "Limpar",
          submitting: "A submeter...",
          requiredAttachment: "Anexe o seu CV antes de submeter.",
          removeFile: "Remover ficheiro",
          invalidFileType: "Formato inválido. Use PDF, DOC ou DOCX.",
          fileTooLarge: "Ficheiro demasiado grande. Tamanho máximo: 10MB.",
        };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handlePrimaryFileSelected = (file) => {
    const error = validateFile(file, t);
    if (error) {
      setFieldErrors((current) => ({ ...current, file: error }));
      return;
    }
    setPrimaryCvFile(file);
    setFieldErrors((current) => ({ ...current, file: "" }));
    setFormData((current) => ({ ...current, "file-upload": file.name }));
  };

  const handlePrimaryFileCleared = () => {
    setPrimaryCvFile(null);
    setFormData((current) => ({ ...current, "file-upload": "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setStatus({ type: "", message: "" });
    setFieldErrors({ file: "", consent: "" });

    if (!formData["file-upload"]) {
      setFieldErrors((current) => ({ ...current, file: t.requiredAttachment }));
      return;
    }
    if (!legalConsent) {
      setFieldErrors((current) => ({ ...current, consent: t.requiredConsent }));
      return;
    }

    setSubmitting(true);

    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (key === "file-upload") return;
        payload.append(key, String(value || ""));
      });
      if (primaryCvFile) payload.append("cv", primaryCvFile);

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
      setLegalConsent(false);
      setSubmitted(false);
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
                <label htmlFor="email" className={labelClass}>{t.email}</label>
                <input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} autoComplete="email" className={fieldClass} required />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="cellphoneContact" className={labelClass}>{t.phone}</label>
                <input id="cellphoneContact" name="cellphoneContact" type="tel" value={formData.cellphoneContact} onChange={handleInputChange} autoComplete="tel" className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="city" className={labelClass}>{t.city}</label>
                <input id="city" name="city" type="text" value={formData.city} onChange={handleInputChange} autoComplete="address-level2" className={fieldClass} />
              </div>

              <div className="col-span-full">
                <label htmlFor="personalStatement" className={labelClass}>{t.statement}</label>
                <textarea
                  id="personalStatement"
                  name="personalStatement"
                  rows={3}
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
                file={primaryCvFile}
                onFileSelected={handlePrimaryFileSelected}
                onFileCleared={handlePrimaryFileCleared}
                chooseFileLabel={t.chooseFile}
                dragDropLabel={t.dragDrop}
                removeLabel={t.removeFile}
              />
              <FormFieldError id="file-upload-error" message={submitted ? fieldErrors.file : ""} />
            </FormSection>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-bold text-slate-950">{t.legalTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t.legalBody}
              </p>
              <label htmlFor="legalConsent" className="mt-4 flex items-start gap-3 text-sm text-slate-800">
                <input
                  id="legalConsent"
                  name="legalConsent"
                  type="checkbox"
                  checked={legalConsent}
                  onChange={(e) => {
                    setLegalConsent(e.target.checked);
                    setFieldErrors((current) => ({ ...current, consent: "" }));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="font-medium">{t.legalCheckboxLabel}</span>
              </label>
              <FormFieldError id="legal-consent-error" message={submitted ? fieldErrors.consent : ""} />
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="reset"
                onClick={() => {
                  setFormData(initialFormData);
                  setPrimaryCvFile(null);
                  setLegalConsent(false);
                  setFieldErrors({ file: "", consent: "" });
                  setSubmitted(false);
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
