"use client";

type Props = {
  audience: "company" | "candidate";
  checked: boolean;
  onChange: (checked: boolean) => void;
};

const COPY: Record<Props["audience"], string> = {
  company:
    "Os planos de Empresa não são reembolsáveis a partir do momento em que são ativados, salvo indisponibilidade do serviço, cobrança duplicada, erro de faturação ou fraude comprovada.",
  candidate:
    "Se for residente na UE, dispõe de 14 dias para pedir reembolso — direito que se extingue assim que utilizar uma funcionalidade de IA paga. Fora deste prazo, o plano não é reembolsável após ativação, salvo indisponibilidade do serviço, cobrança duplicada, erro de faturação ou fraude comprovada.",
};

export default function RefundDisclosureNotice({ audience, checked, onChange }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">{COPY[audience]}</p>
      <label className="mt-2.5 flex items-start gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
        />
        Li e aceito a{" "}
        <a
          href="/reembolsos"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-red-600 underline hover:text-red-700"
        >
          Política de Reembolsos e Cancelamento
        </a>
      </label>
    </div>
  );
}
