## 1. Identidade e Contactos do Responsável pelo Tratamento

A Parvagas é operada por **Usolu Tech Ltd** (NIF 5001246658), com sede em Luanda, Angola ("**Parvagas**", "**nós**"), enquanto responsável pelo tratamento ("*data controller*") dos dados pessoais recolhidos através da plataforma disponível em **parvagas.pt** e domínios associados (a "**Plataforma**").

- Contacto geral / suporte: [suporte@parvagas.pt](mailto:suporte@parvagas.pt)
- Contacto para assuntos de privacidade e proteção de dados: [privacidade@parvagas.pt](mailto:privacidade@parvagas.pt)

Para exercer os seus direitos ou apresentar reclamações relacionadas com dados pessoais, deverá contactar o endereço acima indicado. Terá resposta no prazo máximo de 30 dias.

Esta Política aplica-se a todos os utilizadores da Plataforma, independentemente da sua localização, e é regida em conjunto pela **Lei n.º 22/11, de 17 de Junho** (Lei de Proteção de Dados Pessoais de Angola) e, sempre que o utilizador se encontre no Espaço Económico Europeu ou os dados sejam de outra forma abrangidos pelo seu âmbito de aplicação, pelo **Regulamento (UE) 2016/679** (Regulamento Geral sobre a Proteção de Dados, "RGPD").

## 2. Dados Pessoais que Recolhemos

### 2.1 Candidatos

Quando um candidato regista conta ou utiliza a Plataforma, recolhemos:

- Nome completo, endereço de email e número de telefone
- Localização, nacionalidade e disponibilidade
- Título profissional, resumo e experiência laboral
- Formação académica, competências, idiomas e certificações
- Preferências de emprego: categorias preferidas, localização, salário esperado
- Ficheiros de Curriculum Vitae (CV) em formato PDF ou DOCX
- Pontuação de perfil e sugestões geradas automaticamente com base nos dados fornecidos
- Historial de candidaturas e estado das mesmas
- Alertas de emprego e preferências de notificação
- Consentimentos registados: identificador da versão exata de cada documento legal aceite e data/hora de aceitação (ver [Secção 3](#base-legal))

### 2.2 Empresas Empregadoras

Quando uma empresa se regista, recolhemos:

- Nome comercial e designação legal da empresa
- Número de Identificação Fiscal (NIF), quando aplicável
- Sector de atividade, dimensão, website e localização
- Nome e dados de contacto da pessoa responsável pela conta
- Logótipo e descrição da empresa
- Estado de verificação e historial de publicações de vagas
- Dados dos utilizadores membros da conta empresarial (equipa)

### 2.3 Dados Gerados Automaticamente

Independentemente do tipo de conta, a Plataforma regista:

- Endereço IP, tipo de navegador e sistema operativo
- Páginas visitadas, duração da sessão e interações com a interface
- Registos de auditoria relativos a ações administrativas
- Impressões e cliques em campanhas publicitárias (anónimos)
- Eventos de segurança relevantes (ex.: tentativas de início de sessão falhadas) associados ao endereço IP e à conta visada, para efeitos de deteção de abuso

## 3. Finalidades e Bases Legais do Tratamento {#base-legal}

O tratamento dos dados pessoais é realizado com base nas seguintes justificações legais (Art. 6.º RGPD / Art. 7.º Lei n.º 22/11):

- **Execução contratual** — criação e gestão de conta, publicação de vagas, candidaturas a emprego e demais funcionalidades associadas ao serviço contratado, incluindo a gestão de subscrições e pagamentos.
- **Consentimento explícito** — processamento de CV por inteligência artificial, envio de comunicações de marketing/newsletter (opt-in), e utilização de cookies não essenciais. O consentimento pode ser retirado a qualquer momento, sem afetar a licitude do tratamento realizado antes da retirada.
- **Interesse legítimo** — deteção e prevenção de fraude e abuso, segurança da Plataforma, análise agregada e anónima de utilização, melhoria do serviço. Nestes casos, ponderámos o nosso interesse face aos direitos e liberdades dos titulares dos dados e disponibilizamos sempre um mecanismo de oposição.
- **Cumprimento de obrigação legal** — conservação de registos fiscais e de auditoria, resposta a ordens judiciais ou de autoridades competentes.

## 4. Partilha de Dados com Terceiros e Subcontratantes

Não vendemos dados pessoais. Partilhamos dados pessoais apenas nas seguintes circunstâncias:

- **Com empresas empregadoras**, quando o candidato submete uma candidatura — apenas os campos do perfil e o CV que o candidato aprovar para essa candidatura específica.
- **Com subcontratantes (subprocessors)** que prestam serviços em nosso nome, sob contrato de tratamento de dados equivalente ao previsto no Art. 28.º RGPD, limitados às finalidades abaixo:

| Subcontratante / Serviço | Finalidade | Dados envolvidos | Localização |
|---|---|---|---|
| Infraestrutura própria (Ollama, auto-hospedado) | Geração de sugestões de perfil por IA (camada gratuita) | Conteúdo do CV submetido | Servidor próprio, Angola/UE |
| Fornecedor de IA compatível com OpenAI (ativado apenas quando a funcionalidade de IA paga está ligada) | Análise de CV / pontuação avançada, quando esta funcionalidade está ativa para o utilizador | Conteúdo do CV, dados de perfil relevantes | Depende do fornecedor selecionado — indicado na Secção 5 |
| Armazenamento de objetos (MinIO auto-hospedado, ou Supabase Storage como infraestrutura temporária) | Armazenamento de ficheiros de CV e documentos | Ficheiros de CV/documentos | Servidor próprio ou UE (Supabase) |
| Serviço de email transacional (SMTP próprio, com possibilidade de recurso a fornecedor externo) | Envio de emails de conta, notificações e recibos | Nome, email, conteúdo da comunicação | Servidor próprio ou fornecedor externo |
| Have I Been Pwned (HIBP) | Verificação de exposição de credenciais em fugas de dados conhecidas, para reforço de segurança da conta | Hash da password / endereço de email (nunca a password em claro) | Reino Unido |
| Google reCAPTCHA Enterprise | Prevenção de spam e abuso automatizado em formulários públicos | Interações com o formulário, endereço IP | Estados Unidos |
| Sentry | Deteção e diagnóstico de erros técnicos da aplicação | Metadados técnicos do erro; dados pessoais evitados por desenho, podem ocorrer incidentalmente | União Europeia / Estados Unidos |
| Plausible Analytics / Vercel Analytics | Estatísticas de utilização agregadas e anonimizadas do website | Endereço IP anonimizado, páginas visitadas | União Europeia / Estados Unidos |
| Vercel | Alojamento da aplicação frontend | Dados de tráfego necessários à entrega do serviço | Global (rede de distribuição) |

Esta tabela é mantida atualizada; a versão vigente está sempre disponível nesta página. Alterações que introduzam um novo subcontratante com acesso a dados de CV são comunicadas com pelo menos 15 dias de antecedência aos titulares afetados, quando exigido por lei.

- **Por obrigação legal**, quando exigido por autoridade judicial ou administrativa competente.
- **Em caso de reestruturação societária** (fusão, aquisição), sujeito às mesmas garantias de proteção de dados.

### 4.1 Transferências Internacionais

Alguns subcontratantes indicados na tabela acima processam dados fora de Angola e, quando aplicável, fora do Espaço Económico Europeu. Nesses casos, garantimos um nível de proteção adequado através de Cláusulas Contratuais-Tipo da Comissão Europeia, decisões de adequação aplicáveis, ou outro mecanismo legalmente reconhecido. Pode solicitar uma cópia das salvaguardas aplicáveis através de [privacidade@parvagas.pt](mailto:privacidade@parvagas.pt).

## 5. Inteligência Artificial e Processamento Automatizado

A funcionalidade de criação automática de perfil a partir do CV está sujeita a consentimento explícito adicional, prestado no momento da ativação — ver o documento **Consentimento do Candidato para Tratamento de CV e Processamento por IA**. Em resumo:

- Todo o conteúdo gerado por IA é apresentado ao candidato para revisão e aprovação antes de ser guardado ou utilizado numa candidatura.
- Nenhuma decisão com efeitos jurídicos ou similarmente significativos é tomada de forma exclusivamente automatizada — a pontuação de compatibilidade é meramente indicativa e não substitui a apreciação humana pela empresa empregadora.
- O candidato pode opor-se ao processamento por IA a qualquer momento, continuando a poder utilizar a Plataforma através de preenchimento manual do perfil.

## 6. Retenção de Dados

Os períodos de conservação de cada categoria de dados estão definidos na nossa [Política de Retenção de Dados](/politica-retencao), parte integrante desta Política.

## 7. Direitos dos Titulares dos Dados

Sujeito às condições previstas na lei aplicável, tem o direito de:

- **Aceder** aos dados pessoais que tratamos sobre si;
- **Retificar** dados incorretos ou incompletos;
- **Apagar** os seus dados pessoais ("direito ao esquecimento"), sujeito às obrigações de retenção legal aplicáveis;
- **Limitar** o tratamento em determinadas circunstâncias;
- **Portabilidade** — receber os seus dados num formato estruturado e de uso corrente, ou solicitar a sua transmissão direta a outro responsável;
- **Opor-se** ao tratamento baseado em interesse legítimo ou para fins de marketing direto;
- **Retirar o consentimento** prestado, a qualquer momento, sem afetar a licitude do tratamento anterior;
- **Não ser sujeito a decisões automatizadas** com efeitos jurídicos ou significativos sem intervenção humana.

Os pedidos de exercício de direitos podem ser submetidos através da área "Definições" da sua conta (quando disponível) ou por email para [privacidade@parvagas.pt](mailto:privacidade@parvagas.pt). Respondemos no prazo de 30 dias, prorrogável em casos de especial complexidade.

### 7.1 Direito de Reclamação

Sem prejuízo de qualquer outra via de recurso administrativo ou judicial, tem o direito de apresentar reclamação junto de:

- **Agência de Proteção de Dados (APD)**, Angola — autoridade de controlo nos termos da Lei n.º 22/11; ou
- **Comissão Nacional de Proteção de Dados (CNPD)**, Portugal, ou a autoridade de controlo do seu Estado-Membro de residência habitual, local de trabalho ou local da alegada infração, nos termos do RGPD.

## 8. Segurança dos Dados

Aplicamos medidas técnicas e organizativas adequadas ao risco, incluindo: encriptação de credenciais (hashing de passwords), controlo de acesso baseado em funções para a equipa administrativa (ver [Política de Acesso e Operações Administrativas](#)), registo de auditoria de ações privilegiadas, e monitorização de eventos de segurança. Detalhes adicionais constam da nossa Política de Segurança e Notificação de Incidentes (documento interno, resumo disponível a pedido).

## 9. Menores

A Plataforma destina-se a utilizadores com idade legal para trabalhar em Angola ou no seu país de residência. Não recolhemos intencionalmente dados de menores abaixo dessa idade. Se tomarmos conhecimento de tal recolha, procederemos à eliminação dos dados.

## 10. Alterações a esta Política

Esta Política pode ser atualizada para refletir alterações técnicas, legais ou operacionais. Cada atualização gera uma nova versão numerada e datada; alterações materiais são comunicadas aos utilizadores com contas ativas, podendo implicar a necessidade de novo consentimento (re-aceitação) antes da continuação de determinadas funcionalidades.
