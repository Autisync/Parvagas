import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/app/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Termos para Empregadores",
  description:
    "Condições de utilização da Parvagas por empresas: publicação de vagas, verificação, tratamento de dados de candidatos e não discriminação, ao abrigo da LGT (Angola) e do RGPD.",
  alternates: { canonical: "/termos-empregador" },
  robots: { index: true, follow: true },
};

const UL = "list-disc space-y-1 pl-5 marker:text-red-400";

export default function TermosEmpregadorPage() {
  return (
    <LegalShell
      title="Termos do Empregador"
      subtitle="Condições adicionais aplicáveis às empresas e recrutadores que utilizam a Parvagas para publicar vagas e aceder a candidaturas. Complementam os Termos e Condições gerais."
      effectiveDate="1 de Julho de 2026"
    >
      <LegalSection id="conta" title="1. Conta de empresa e equipa">
        <p>
          A conta de empresa deve ser criada por um representante com poderes para vincular a organização. O titular da
          conta é responsável pelos acessos concedidos aos membros da equipa (proprietário, recrutador, visualizador) e
          pela atividade realizada sob a conta.
        </p>
      </LegalSection>

      <LegalSection id="verificacao" title="2. Verificação">
        <p>
          A Parvagas pode exigir a verificação da empresa (identificação, NIF/documentos) antes de permitir a publicação
          de vagas ou o acesso a candidaturas. Podemos recusar, suspender ou rever a verificação para prevenir fraude e
          proteger candidatos.
        </p>
      </LegalSection>

      <LegalSection id="publicacao" title="3. Regras de publicação de vagas">
        <ul className={UL}>
          <li>As vagas devem ser reais, atuais e descrever com exatidão a função, os requisitos e as condições;</li>
          <li>É proibido exigir pagamentos aos candidatos ou usar as vagas para esquemas fraudulentos;</li>
          <li>Não é permitido conteúdo enganoso, discriminatório ou ilícito;</li>
          <li>
            As vagas estão sujeitas a moderação; a Parvagas pode aprovar, rejeitar, arquivar ou remover publicações que
            violem estas regras.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="nao-discriminacao" title="4. Não discriminação e igualdade">
        <p>
          A empresa compromete-se a cumprir os princípios de igualdade e não discriminação previstos na{" "}
          <strong>Lei n.º 7/15, de 15 de Junho (Lei Geral do Trabalho de Angola)</strong> e, quando aplicável, no{" "}
          <strong>Código do Trabalho português</strong> e no direito da União. É proibido publicar critérios
          discriminatórios em razão de sexo, raça, origem, religião, opinião política, estado de saúde, deficiência ou
          outros fatores protegidos por lei.
        </p>
      </LegalSection>

      <LegalSection id="dados-candidatos" title="5. Tratamento de dados de candidatos">
        <p>
          Ao aceder a candidaturas, a empresa passa a tratar dados pessoais de candidatos como{" "}
          <strong>responsável independente pelo tratamento</strong> e obriga-se a:
        </p>
        <ul className={UL}>
          <li>Utilizar os dados exclusivamente para o processo de recrutamento a que respeitam;</li>
          <li>Não partilhar, vender ou reutilizar os dados para outras finalidades sem base legal e informação ao titular;</li>
          <li>Aplicar medidas de segurança adequadas e respeitar os direitos dos titulares;</li>
          <li>
            Cumprir a <strong>Lei n.º 22/11 (Angola)</strong> e o <strong>RGPD</strong> / <strong>Lei n.º 58/2019</strong>{" "}
            (Portugal), incluindo os prazos de conservação e a eliminação quando cessar a finalidade.
          </li>
        </ul>
        <p>
          A Parvagas disponibiliza a informação de privacidade aos candidatos; a base de licitude do tratamento feito
          pela empresa após a receção da candidatura é da responsabilidade desta.
        </p>
      </LegalSection>

      <LegalSection id="vagas-privadas" title="6. Vagas privadas e confidenciais">
        <p>
          As vagas marcadas como privadas ou confidenciais destinam-se a divulgação restrita. A empresa é responsável
          por utilizar corretamente esta funcionalidade e por não expor informação confidencial de forma indevida.
        </p>
      </LegalSection>

      <LegalSection id="pagamentos" title="7. Serviços pagos, campanhas e faturação">
        <p>
          Os serviços pagos (por exemplo, campanhas publicitárias, destaques ou planos) regem-se pelas condições
          comerciais apresentadas no momento da contratação. Os valores, impostos aplicáveis e condições de pagamento
          são indicados antes da confirmação. Salvo disposição legal imperativa em contrário, os montantes relativos a
          serviços já prestados não são reembolsáveis.
        </p>
      </LegalSection>

      <LegalSection id="conteudo-proibido" title="8. Conteúdo e condutas proibidas">
        <ul className={UL}>
          <li>Vagas falsas, duplicadas em massa ou destinadas a recolher dados sem intenção real de contratar;</li>
          <li>Solicitação de dados sensíveis desnecessários ao recrutamento;</li>
          <li>Contacto abusivo, assédio ou utilização dos dados para spam;</li>
          <li>Tentativas de contornar a moderação ou os mecanismos de segurança.</li>
        </ul>
      </LegalSection>

      <LegalSection id="responsabilidade" title="9. Responsabilidade e indemnização">
        <p>
          A empresa é responsável pelo cumprimento das leis laborais, fiscais e de proteção de dados aplicáveis à sua
          atividade de recrutamento. Compromete-se a manter a Parvagas indemne por reclamações de terceiros decorrentes
          da violação destes Termos ou do tratamento indevido de dados de candidatos.
        </p>
      </LegalSection>

      <LegalSection id="cessacao" title="10. Suspensão e cessação">
        <p>
          A Parvagas pode suspender ou encerrar contas de empresa que violem estes Termos, os{" "}
          <Link href="/termos" className="font-semibold text-red-700 hover:underline">
            Termos gerais
          </Link>{" "}
          ou a lei aplicável, sem prejuízo das obrigações de conservação previstas na{" "}
          <Link href="/politica-retencao" className="font-semibold text-red-700 hover:underline">
            Política de Retenção
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
