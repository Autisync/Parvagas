import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection } from "@/app/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Termos e Condições",
  description:
    "Termos e condições de utilização da plataforma Parvagas por candidatos e utilizadores, ao abrigo da lei angolana e portuguesa.",
  alternates: { canonical: "/termos" },
  robots: { index: true, follow: true },
};

const UL = "list-disc space-y-1 pl-5 marker:text-red-400";

export default function TermosPage() {
  return (
    <LegalShell
      title="Termos e Condições de Utilização"
      subtitle="Estas condições regem o acesso e a utilização da plataforma Parvagas por candidatos e utilizadores em geral. Ao criar conta ou utilizar a plataforma, aceita estes termos."
      effectiveDate="1 de Julho de 2026"
    >
      <LegalSection id="aceitacao" title="1. Aceitação e âmbito">
        <p>
          Ao aceder ou utilizar a Parvagas, o utilizador declara ter lido e aceite estes Termos e a{" "}
          <Link href="/privacidade" className="font-semibold text-red-700 hover:underline">
            Política de Privacidade
          </Link>
          . As empresas empregadoras estão adicionalmente sujeitas aos{" "}
          <Link href="/termos-empregador" className="font-semibold text-red-700 hover:underline">
            Termos do Empregador
          </Link>
          . Se não concordar, não deve utilizar a plataforma.
        </p>
      </LegalSection>

      <LegalSection id="elegibilidade" title="2. Elegibilidade e conta">
        <ul className={UL}>
          <li>Deve ter idade legal para trabalhar e capacidade jurídica para celebrar contratos.</li>
          <li>Compromete-se a fornecer informação verdadeira, exata e atualizada.</li>
          <li>É responsável por manter a confidencialidade das suas credenciais e por toda a atividade na sua conta.</li>
          <li>Deve notificar-nos de imediato em caso de utilização não autorizada da conta.</li>
        </ul>
      </LegalSection>

      <LegalSection id="utilizacao" title="3. Utilização aceitável">
        <p>O utilizador compromete-se a não:</p>
        <ul className={UL}>
          <li>Publicar informação falsa, difamatória, discriminatória ou ilícita;</li>
          <li>Fazer-se passar por outra pessoa ou entidade;</li>
          <li>Recolher dados de outros utilizadores de forma automatizada sem autorização;</li>
          <li>Introduzir código malicioso, tentar aceder indevidamente a sistemas ou contornar mecanismos de segurança;</li>
          <li>Utilizar a plataforma para fins fraudulentos, esquemas de pagamento antecipado ou solicitação indevida.</li>
        </ul>
      </LegalSection>

      <LegalSection id="conteudo" title="4. Conteúdo do utilizador">
        <p>
          Mantém a titularidade do conteúdo que carrega (CV, perfil, mensagens). Concede à Parvagas uma licença
          mundial, não exclusiva e gratuita para alojar, reproduzir e apresentar esse conteúdo na medida do necessário
          para prestar o serviço — nomeadamente, torná-lo visível às empresas a que se candidata. Garante que dispõe dos
          direitos sobre o conteúdo que submete.
        </p>
      </LegalSection>

      <LegalSection id="vagas-terceiros" title="5. Vagas de terceiros e conteúdo agregado">
        <p>
          A plataforma pode apresentar vagas agregadas de fontes externas. A Parvagas não garante a exatidão,
          disponibilidade ou legitimidade dessas vagas e recomenda prudência. Sinalize vagas suspeitas através das
          ferramentas disponíveis; dispomos de mecanismos de deteção de vagas fraudulentas, mas a verificação final cabe
          ao utilizador.
        </p>
      </LegalSection>

      <LegalSection id="sem-garantia" title="6. Ausência de garantia de emprego">
        <p>
          A Parvagas é uma plataforma de intermediação. Não somos parte na relação laboral nem garantimos a obtenção de
          emprego, entrevistas ou resultados. As decisões de contratação pertencem exclusivamente às empresas.
        </p>
      </LegalSection>

      <LegalSection id="propriedade" title="7. Propriedade intelectual">
        <p>
          A marca, o software, o design e os conteúdos originais da Parvagas são protegidos por direitos de propriedade
          intelectual e não podem ser copiados ou explorados sem autorização. Os conteúdos de terceiros pertencem aos
          respetivos titulares.
        </p>
      </LegalSection>

      <LegalSection id="suspensao" title="8. Suspensão e cessação">
        <p>
          Podemos suspender ou encerrar contas que violem estes Termos, que representem risco de segurança ou fraude, ou
          quando exigido por lei. Pode encerrar a sua conta a qualquer momento; certos dados poderão ser conservados
          conforme a{" "}
          <Link href="/politica-retencao" className="font-semibold text-red-700 hover:underline">
            Política de Retenção
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="responsabilidade" title="9. Limitação de responsabilidade">
        <p>
          Na máxima medida permitida pela lei aplicável, a Parvagas não responde por danos indiretos, lucros cessantes
          ou perdas resultantes de interações com empresas ou candidatos, de vagas de terceiros ou da indisponibilidade
          temporária do serviço. Nada nestes Termos exclui responsabilidades que não possam legalmente ser afastadas.
        </p>
      </LegalSection>

      <LegalSection id="lei" title="10. Lei aplicável e resolução de litígios">
        <p>
          Estes Termos regem-se pela lei angolana para utilizadores em Angola e pela lei portuguesa/da União Europeia
          para utilizadores em Portugal e no EEE. Sempre que possível, os litígios serão resolvidos amigavelmente;
          na sua falta, serão competentes os tribunais do domicílio do utilizador, quando a lei imperativa de defesa do
          consumidor assim o determinar, ou os tribunais de Luanda nos restantes casos.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="11. Alterações">
        <p>
          Podemos rever estes Termos. A versão atualizada será publicada nesta página com nova data de entrada em vigor.
          A continuação da utilização após a publicação constitui aceitação das alterações.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
