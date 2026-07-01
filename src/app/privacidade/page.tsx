import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/app/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como a Parvagas recolhe, usa e protege os dados pessoais de candidatos e empresas, em conformidade com a Lei 22/11 (Angola) e o RGPD (UE/Portugal).",
  alternates: { canonical: "/privacidade" },
  robots: { index: true, follow: true },
};

const UL = "list-disc space-y-1 pl-5 marker:text-red-400";

export default function PrivacidadePage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      subtitle="Esta política explica que dados pessoais recolhemos, com que finalidades e fundamentos legais os tratamos, com quem os partilhamos e quais os seus direitos enquanto titular dos dados."
      effectiveDate="1 de Julho de 2026"
    >
      <LegalSection id="responsavel" title="1. Responsável pelo tratamento">
        <p>
          A Parvagas (&ldquo;Parvagas&rdquo;, &ldquo;nós&rdquo;) opera uma plataforma de recrutamento que liga candidatos
          e empresas em Angola e na diáspora lusófona. Para efeitos da{" "}
          <strong>Lei n.º 22/11, de 17 de Junho (Lei da Proteção de Dados Pessoais de Angola)</strong> e do{" "}
          <strong>Regulamento (UE) 2016/679 (RGPD)</strong>, conjugado com a{" "}
          <strong>Lei n.º 58/2019</strong> de Portugal, a Parvagas é a entidade responsável pelo tratamento dos dados
          pessoais descritos nesta política.
        </p>
        <p>
          Contacto do Encarregado de Proteção de Dados (DPO):{" "}
          <a href="mailto:privacidade@parvagas.pt" className="font-semibold text-red-700 hover:underline">
            privacidade@parvagas.pt
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="dados" title="2. Que dados recolhemos">
        <p>Consoante a sua utilização da plataforma, podemos tratar as seguintes categorias de dados:</p>
        <ul className={UL}>
          <li>
            <strong>Dados de conta:</strong> nome, endereço de e-mail, número de telefone, palavra-passe (armazenada de
            forma cifrada), papel (candidato/empresa) e definições de idioma.
          </li>
          <li>
            <strong>Dados de perfil de candidato:</strong> localização, resumo profissional, experiência, formação,
            competências, línguas, certificações e preferências de emprego.
          </li>
          <li>
            <strong>Documentos e CV:</strong> ficheiros de currículo carregados e os dados extraídos automaticamente do
            CV através de processamento assistido por inteligência artificial (ver secção 4).
          </li>
          <li>
            <strong>Dados de candidatura:</strong> vagas a que se candidata, mensagens, estado da candidatura e
            interações com empresas.
          </li>
          <li>
            <strong>Dados de empresa:</strong> denominação, NIF/identificador, setor, dimensão, documentos de
            verificação e dados dos membros da equipa.
          </li>
          <li>
            <strong>Dados de autenticação de terceiros:</strong> quando inicia sessão com o Google, recebemos o seu
            identificador, nome e e-mail dessa conta; quando usa verificação por telefone, tratamos o número e os
            códigos de uso único (OTP).
          </li>
          <li>
            <strong>Dados de pagamento:</strong> para campanhas publicitárias e serviços pagos, registamos o histórico
            de transações. Os dados de cartão/conta são processados pelo prestador de pagamentos, não pela Parvagas.
          </li>
          <li>
            <strong>Dados técnicos e de segurança:</strong> endereço IP, identificador de pedido, registos de acesso e
            auditoria, e sinais do reCAPTCHA usados para prevenir fraude e abuso.
          </li>
          <li>
            <strong>Dados de utilização:</strong> métricas agregadas de navegação recolhidas por ferramentas de análise
            respeitadoras da privacidade.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="finalidades" title="3. Finalidades e fundamentos legais">
        <p>Tratamos os seus dados com base nos seguintes fundamentos legais:</p>
        <ul className={UL}>
          <li>
            <strong>Execução de contrato</strong> — criar e gerir a sua conta, apresentar vagas, processar candidaturas
            e permitir a comunicação entre candidatos e empresas.
          </li>
          <li>
            <strong>Consentimento</strong> — processamento do CV por IA, envio de alertas e comunicações de marketing, e
            colocação de cookies não essenciais. Pode retirar o consentimento a qualquer momento.
          </li>
          <li>
            <strong>Interesse legítimo</strong> — segurança da plataforma, prevenção de fraude e de vagas fraudulentas,
            melhoria do serviço e deteção de abusos, sempre ponderado face aos seus direitos.
          </li>
          <li>
            <strong>Cumprimento de obrigação legal</strong> — conservação de registos contabilísticos, resposta a
            autoridades competentes e cumprimento das leis laborais e fiscais aplicáveis.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="ia" title="4. Processamento de CV por inteligência artificial">
        <p>
          Com o seu consentimento explícito, a Parvagas utiliza processamento automatizado para extrair informação
          estruturada do seu CV (por exemplo, experiência e competências), de modo a pré-preencher o seu perfil e
          melhorar a correspondência com vagas. Este processamento não produz decisões com efeitos jurídicos sobre si
          sem intervenção humana: as decisões de contratação são sempre tomadas pelas empresas. Pode recusar este
          processamento e continuar a usar a plataforma preenchendo o perfil manualmente.
        </p>
      </LegalSection>

      <LegalSection id="partilha" title="5. Com quem partilhamos dados">
        <ul className={UL}>
          <li>
            <strong>Empresas empregadoras:</strong> quando se candidata a uma vaga, o seu perfil e candidatura ficam
            acessíveis à empresa respetiva, que atua como responsável independente pelo tratamento dos dados que recebe.
          </li>
          <li>
            <strong>Subcontratantes (processadores):</strong> prestadores de infraestrutura e armazenamento de
            ficheiros, envio de e-mail, SMS e WhatsApp, análise de tráfego, reCAPTCHA e processamento de pagamentos.
            Estes tratam os dados apenas segundo as nossas instruções e sob acordo de tratamento de dados.
          </li>
          <li>
            <strong>Autoridades:</strong> quando exigido por lei ou para proteger direitos, segurança e prevenção de
            fraude.
          </li>
        </ul>
        <p>Não vendemos os seus dados pessoais.</p>
      </LegalSection>

      <LegalSection id="transferencias" title="6. Transferências internacionais">
        <p>
          Alguns subcontratantes podem tratar dados fora de Angola ou do Espaço Económico Europeu. Nesses casos,
          asseguramos garantias adequadas — como cláusulas contratuais-tipo, decisões de adequação ou o consentimento do
          titular — em conformidade com o Capítulo V do RGPD e com as regras da Lei n.º 22/11 sobre transferência
          internacional de dados, sujeita à autorização da Agência de Proteção de Dados (APD) quando aplicável.
        </p>
      </LegalSection>

      <LegalSection id="conservacao" title="7. Conservação">
        <p>
          Conservamos os dados apenas durante o período necessário às finalidades descritas. Os prazos concretos por
          categoria constam da nossa{" "}
          <Link href="/politica-retencao" className="font-semibold text-red-700 hover:underline">
            Política de Retenção de Dados
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="8. Os seus direitos">
        <p>Enquanto titular dos dados, assistem-lhe os seguintes direitos:</p>
        <ul className={UL}>
          <li>Acesso aos seus dados e informação sobre o respetivo tratamento;</li>
          <li>Retificação de dados incorretos ou desatualizados;</li>
          <li>Apagamento (&ldquo;direito a ser esquecido&rdquo;), nos limites legais;</li>
          <li>Limitação e oposição ao tratamento;</li>
          <li>Portabilidade dos dados que nos forneceu, em formato estruturado;</li>
          <li>Retirada do consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.</li>
        </ul>
        <p>
          Para exercer estes direitos, contacte{" "}
          <a href="mailto:privacidade@parvagas.pt" className="font-semibold text-red-700 hover:underline">
            privacidade@parvagas.pt
          </a>
          . Pode também apresentar reclamação junto da APD (Angola) ou da CNPD (Portugal).
        </p>
      </LegalSection>

      <LegalSection id="seguranca" title="9. Segurança">
        <p>
          Aplicamos medidas técnicas e organizativas adequadas: cifragem de palavras-passe, ligações seguras (HTTPS/TLS
          com HSTS), Política de Segurança de Conteúdos, controlo de acessos por papéis, limitação de tentativas e
          registos de auditoria. Nenhum sistema é totalmente inviolável, pelo que também depende de si manter as
          credenciais em segurança.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="10. Cookies e tecnologias semelhantes">
        <p>
          Utilizamos cookies estritamente necessários para o funcionamento e a segurança da plataforma e, mediante
          consentimento, cookies de análise. Pode gerir as suas preferências através do banner de consentimento e das
          definições do seu navegador.
        </p>
      </LegalSection>

      <LegalSection id="menores" title="11. Menores">
        <p>
          A plataforma destina-se a pessoas com idade legal para trabalhar. Não recolhemos intencionalmente dados de
          menores abaixo da idade mínima de admissão ao trabalho prevista na legislação aplicável. Se tomarmos
          conhecimento de tal recolha, eliminaremos os dados.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="12. Alterações a esta política">
        <p>
          Podemos atualizar esta política para refletir alterações legais ou do serviço. Publicaremos a versão revista
          nesta página, atualizando a data de entrada em vigor. Alterações substanciais serão comunicadas por meios
          adequados.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
