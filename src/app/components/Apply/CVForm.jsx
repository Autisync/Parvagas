"use client";

import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

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

function UploadBox({ id, name, title, description, onChange }) {
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
            Escolher ficheiro
          </label>
          <span>ou arraste e solte</span>
          <input id={id} name={name} type="file" onChange={onChange} className="sr-only" />
        </div>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function CVForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((current) => ({
      ...current,
      [name]: files?.[0]?.name ?? value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", message: "" });
    setSubmitting(true);

    try {
      const response = await fetch("http://localhost:3001/applications/application", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Falha ao submeter candidatura.");

      setStatus({ type: "success", message: "CV submetido com sucesso. A equipa Parvagas irá analisar a informação." });
      setFormData(initialFormData);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível submeter o CV.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[0.8fr,1.2fr]">
          <aside className="bg-slate-950 p-8 text-white sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Submeter CV</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">Partilhe o seu perfil profissional.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Complete os dados essenciais para que a equipa Parvagas possa considerar o seu perfil em oportunidades relevantes.
            </p>
            <div className="mt-10 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Dados pessoais e experiência profissional.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">CV e documentos em PDF ou DOCX.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Consentimento para processamento seguro.</div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-8 p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Candidatura espontânea</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Envie o seu CV hoje</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use informação atualizada e contactos válidos para facilitar o acompanhamento da candidatura.
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
              eyebrow="Informação pessoal"
              title="Dados do candidato"
              description="Use o nome completo e contactos permanentes para acompanhamento."
            >
              <div className="sm:col-span-3">
                <label htmlFor="fullName" className={labelClass}>Nome completo</label>
                <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleInputChange} autoComplete="name" className={fieldClass} required />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="dateOfBirth" className={labelClass}>Data de nascimento</label>
                <input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} autoComplete="email" className={fieldClass} required />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="cellphoneContact" className={labelClass}>Contacto telefónico</label>
                <input id="cellphoneContact" name="cellphoneContact" type="tel" value={formData.cellphoneContact} onChange={handleInputChange} autoComplete="tel" className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="gender" className={labelClass}>Sexo</label>
                <select id="gender" name="gender" value={formData.gender} onChange={handleInputChange} className={fieldClass}>
                  <option value="">Escolha</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Binario">Binário</option>
                  <option value="Prefiro nao Especificar">Prefiro não especificar</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="nationality" className={labelClass}>Nacionalidade</label>
                <input id="nationality" name="nationality" type="text" value={formData.nationality} onChange={handleInputChange} className={fieldClass} />
              </div>
            </FormSection>

            <FormSection
              eyebrow="Experiência"
              title="Perfil profissional"
              description="Ajude-nos a entender a sua área, senioridade e disponibilidade."
            >
              <div className="sm:col-span-3">
                <label htmlFor="qualification" className={labelClass}>Habilitação académica</label>
                <select id="qualification" name="qualification" value={formData.qualification} onChange={handleInputChange} className={fieldClass}>
                  <option value="">Escolha</option>
                  <option value="Ensino Médio">Ensino Médio</option>
                  <option value="Certificado">Certificado</option>
                  <option value="Curso Técnico">Curso Técnico</option>
                  <option value="Grau de Associado">Grau de Associado</option>
                  <option value="Bacharelado">Bacharelado</option>
                  <option value="Licenciatura">Licenciatura</option>
                  <option value="Mestrado">Mestrado</option>
                  <option value="Doutorado">Doutorado</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="profession" className={labelClass}>Profissão</label>
                <input id="profession" name="profession" type="text" value={formData.profession} onChange={handleInputChange} autoComplete="organization-title" className={fieldClass} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="expirienceInOilGas" className={labelClass}>Experiência em Oil & Gas?</label>
                <select id="expirienceInOilGas" name="expirienceInOilGas" value={formData.expirienceInOilGas} onChange={handleInputChange} className={fieldClass}>
                  <option value="">Escolha</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="yearsOfExperience" className={labelClass}>Anos de experiência</label>
                <input id="yearsOfExperience" name="yearsOfExperience" type="number" min="0" value={formData.yearsOfExperience} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="currentEmployer" className={labelClass}>Empregador atual</label>
                <input id="currentEmployer" name="currentEmployer" type="text" value={formData.currentEmployer} onChange={handleInputChange} className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="city" className={labelClass}>Cidade</label>
                <input id="city" name="city" type="text" value={formData.city} onChange={handleInputChange} autoComplete="address-level2" className={fieldClass} />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="residencialAddress" className={labelClass}>Endereço físico</label>
                <input id="residencialAddress" name="residencialAddress" type="text" value={formData.residencialAddress} onChange={handleInputChange} autoComplete="street-address" className={fieldClass} />
              </div>

              <div className="col-span-full">
                <label htmlFor="personalStatement" className={labelClass}>Resumo profissional</label>
                <textarea
                  id="personalStatement"
                  name="personalStatement"
                  rows={4}
                  value={formData.personalStatement}
                  onChange={handleInputChange}
                  className={fieldClass}
                  placeholder="Explique brevemente por que devemos considerar o seu perfil."
                />
              </div>
            </FormSection>

            <FormSection eyebrow="Documentos" title="CV e anexos" description="Anexe o CV principal e, se necessário, documentos de apoio.">
              <UploadBox
                id="file-upload"
                name="file-upload"
                title="Curriculum Vitae"
                description="PDF ou DOCX até 10MB."
                onChange={handleInputChange}
              />
              <UploadBox
                id="extrafile-upload"
                name="extrafile-upload"
                title="Outros documentos"
                description="Certificados, carta de apresentação ou anexos relevantes."
                onChange={handleInputChange}
              />
            </FormSection>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-bold text-slate-950">Autorização legal</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Concordo e garanto à Parvagas a segurança e o processamento das informações fornecidas, declarando que são verdadeiras.
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
                Limpar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "A submeter..." : "Submeter CV"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
