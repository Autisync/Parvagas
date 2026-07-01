import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/app/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Política de Retenção de Dados",
  description:
    "Prazos de conservação e eliminação dos dados pessoais tratados pela Parvagas, em conformidade com a Lei 22/11 (Angola) e o RGPD.",
  alternates: { canonical: "/politica-retencao" },
  robots: { index: true, follow: true },
};

const UL = "list-disc space-y-1 pl-5 marker:text-red-400";

type Row = { categoria: string; prazo: string; base: string };

const RETENTION: Row[] = [
  { categoria: "Conta e perfil (candidato/empresa)", prazo: "Enquanto a conta estiver ativa e até 12 meses após o encerramento ou a última atividade.", base: "Execução de contrato / interesse legítimo" },
  { categoria: "CV e documentos carregados", prazo: "Enquanto a conta estiver ativa; eliminados a pedido ou até 12 meses após inatividade.", base: "Consentimento / execução de contrato" },
  { categoria: "Candidaturas e mensagens", prazo: "Até 24 meses após a conclusão do processo de recrutamento.", base: "Interesse legítimo do empregador e do candidato" },
  { categoria: "Registos de acesso e auditoria", prazo: "6 a 12 meses, salvo necessidade de investigação de segurança ou obrigação legal.", base: "Interesse legítimo / obrigação legal" },
  { categoria: "Registos de pagamentos e faturação", prazo: "Pelo prazo legal fiscal/contabilístico aplicável (em regra, até 10 anos).", base: "Obrigação legal" },
  { categoria: "Consentimentos de marketing e alertas", prazo: "Até à retirada do consentimento; prova da retirada conservada pelo prazo de prescrição.", base: "Consentimento" },
  { categoria: "Vagas agregadas de fontes externas", prazo: "Enquanto ativas na fonte; removidas ou anonimizadas após expiração.", base: "Interesse legítimo" },
  { categoria: "Cópias de segurança (backups)", prazo: "Ciclos de rotação de curta duração, tipicamente até 35 dias.", base: "Interesse legítimo (continuidade)" },
];

export default function RetencaoPage() {
  return (
    <LegalShell
      title="Política de Retenção de Dados"
      subtitle="Esta política define durante quanto tempo conservamos cada categoria de dados pessoais e quando os eliminamos ou anonimizamos."
      effectiveDate="1 de Julho de 2026"
    >
      <LegalSection id="principio" title="1. Princípio da limitação da conservação">
        <p>
          Em cumprimento do princípio da limitação da conservação previsto na{" "}
          <strong>Lei n.º 22/11 (Angola)</strong> e no <strong>RGPD</strong>, conservamos os dados pessoais apenas
          durante o período necessário às finalidades para que foram recolhidos, salvo obrigação legal de conservação
          mais longa.
        </p>
      </LegalSection>

      <LegalSection id="prazos" title="2. Prazos por categoria de dados">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Categoria</th>
                <th className="py-2 pr-4 font-semibold">Prazo de conservação</th>
                <th className="py-2 font-semibold">Fundamento</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map((r) => (
                <tr key={r.categoria} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4 font-medium text-slate-800">{r.categoria}</td>
                  <td className="py-3 pr-4 text-slate-600">{r.prazo}</td>
                  <td className="py-3 text-slate-500">{r.base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400">
          Os prazos indicados são máximos de referência; poderão ser encurtados a pedido do titular quando não exista
          obrigação legal de conservação.
        </p>
      </LegalSection>

      <LegalSection id="criterios" title="3. Critérios de definição dos prazos">
        <ul className={UL}>
          <li>Duração da relação contratual e da atividade da conta;</li>
          <li>Prazos legais fiscais, contabilísticos e laborais aplicáveis;</li>
          <li>Prazos de prescrição para o exercício ou defesa de direitos;</li>
          <li>Necessidades de segurança, prevenção de fraude e auditoria.</li>
        </ul>
      </LegalSection>

      <LegalSection id="eliminacao" title="4. Eliminação e anonimização">
        <p>
          Findo o prazo aplicável, os dados são eliminados de forma segura ou irreversivelmente anonimizados, deixando
          nesse caso de constituir dados pessoais e podendo ser usados para fins estatísticos agregados. Os pedidos de
          apagamento são executados nos sistemas de produção e propagados às cópias de segurança no ciclo de rotação
          seguinte.
        </p>
      </LegalSection>

      <LegalSection id="hold" title="5. Suspensão de eliminação (legal hold)">
        <p>
          Quando exista uma obrigação legal, um processo judicial ou uma investigação de segurança em curso, a
          eliminação pode ser suspensa relativamente aos dados estritamente necessários, apenas pelo tempo indispensável.
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="6. Direitos do titular">
        <p>
          Pode solicitar o apagamento antecipado ou informação sobre os prazos aplicáveis ao seu caso através de{" "}
          <a href="mailto:privacidade@parvagas.pt" className="font-semibold text-red-700 hover:underline">
            privacidade@parvagas.pt
          </a>
          . Consulte também a{" "}
          <Link href="/privacidade" className="font-semibold text-red-700 hover:underline">
            Política de Privacidade
          </Link>{" "}
          para o exercício integral dos seus direitos.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
