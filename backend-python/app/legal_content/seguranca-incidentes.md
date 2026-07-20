**Documento de uso interno.** Define as medidas de segurança da informação implementadas na plataforma Parvagas, a classificação de incidentes, e o procedimento de resposta e notificação de violações de dados pessoais ("*data breach*"), incluindo o cumprimento do prazo de 72 horas previsto no Art. 33.º do RGPD. Não constitui, nem substitui, uma apólice de seguro de responsabilidade cibernética — ver Secção 7.

## 1. Medidas de Segurança Implementadas

- **Controlo de acesso baseado em funções (RBAC)** — dois níveis de acesso administrativo (Moderador, Super-Admin), com permissões distintas e princípio do menor privilégio, nos termos da Política de Acesso e Operações Administrativas.
- **Autenticação** — passwords com hashing (bcrypt), tokens de sessão (JWT) com expiração e revogação forçada, deteção de credenciais comprometidas via verificação contra bases de dados públicas de fugas conhecidas (Have I Been Pwned), bloqueio automático após tentativas de acesso falhadas repetidas.
- **Registo e auditoria** — log de auditoria imutável de ações administrativas privilegiadas (suspensão de contas, moderação, exportações de dados); registo de eventos de segurança (tentativas de login falhadas, rajadas de tentativas, limites de envio de email atingidos) com alertas automáticos à equipa quando um limiar é ultrapassado.
- **Segurança de rede e aplicação** — encriptação em trânsito (HTTPS/TLS) em toda a Plataforma; política de segurança de conteúdo (CSP) restritiva no frontend; validação de origem e esquema em URLs geradas por conteúdo de terceiros; proteção contra scripting entre sites (XSS) e falsificação de pedidos entre sites (CSRF); limitação de acesso a rede interna a partir de funcionalidades que efetuam pedidos a URLs configuráveis (proteção SSRF).
- **Isolamento de infraestrutura** — serviços de backend executados sem privilégios de root; segregação de filas de tarefas para isolar cargas de trabalho não confiáveis (ex.: recolha automática de fontes externas) do processamento principal.
- **Gestão de dependências** — monitorização e atualização periódica de dependências de software com vulnerabilidades conhecidas divulgadas.
- **Cópias de segurança** — realizadas com regularidade, com rotação limitada, nos termos da Política de Retenção de Dados.

## 2. Classificação de Incidentes

| Severidade | Critério | Exemplo |
|---|---|---|
| **Crítica** | Acesso não autorizado confirmado a dados pessoais, comprometimento de credenciais administrativas, ou indisponibilidade total do serviço | Exfiltração confirmada de base de dados de utilizadores |
| **Alta** | Indício forte de acesso não autorizado, vulnerabilidade ativamente explorada, ou exposição de dados sem confirmação de exfiltração | Vulnerabilidade crítica reportada com prova de conceito ativa |
| **Média** | Vulnerabilidade identificada sem indício de exploração, indisponibilidade parcial do serviço | Falha de configuração identificada em auditoria interna |
| **Baixa** | Evento de segurança isolado sem impacto confirmado | Tentativa de login falhada isolada |

## 3. Procedimento de Resposta a Incidentes — Runbook

### Passo 1 — Deteção e Registo (imediato)

Qualquer membro da equipa que identifique um incidente de segurança potencial regista-o imediatamente, classificando a severidade nos termos da Secção 2, e notifica o responsável de segurança designado.

### Passo 2 — Contenção (dentro de 4 horas para incidentes Crítica/Alta)

Ações imediatas para limitar o impacto: revogação de credenciais comprometidas, isolamento de sistemas afetados, suspensão de funcionalidades expostas. Cada ação de contenção é registada com hora e responsável.

### Passo 3 — Avaliação do Impacto

Determinar: quais dados foram potencialmente afetados; quantos titulares de dados estão envolvidos; se se trata de uma "violação de dados pessoais" nos termos do Art. 4.º/12 RGPD (violação de segurança que resulte na destruição, perda, alteração, divulgação ou acesso não autorizados a dados pessoais).

### Passo 4 — Início do Relógio de 72 Horas (quando aplicável)

Se a avaliação confirmar uma violação de dados pessoais com risco para os direitos e liberdades dos titulares, inicia-se o prazo de **72 horas** a contar do momento em que a Parvagas tomou conhecimento da violação, para notificação à(s) autoridade(s) de controlo competente(s) (APD, Angola, e/ou CNPD, Portugal, ou autoridade de controlo principal aplicável ao abrigo do RGPD), nos termos do Art. 33.º RGPD.

Se o risco for **elevado** para os direitos e liberdades dos titulares, os titulares afetados são também notificados diretamente, sem demora injustificada, nos termos do Art. 34.º RGPD.

Se a Parvagas atuar como subcontratante de um Cliente empresarial relativamente aos dados afetados (Dados de Candidatura), o Cliente é notificado no prazo de 48 horas, nos termos do [Acordo de Processamento de Dados](/legal/dpa), Secção 5.

### Passo 5 — Notificação

A notificação à autoridade de controlo inclui, na medida do disponível: natureza da violação; categorias e número aproximado de titulares e de registos de dados pessoais afetados; nome e contacto do ponto de contacto para mais informação ([privacidade@parvagas.pt](mailto:privacidade@parvagas.pt)); consequências prováveis; e medidas adotadas ou propostas para mitigar eventuais efeitos negativos. Quando a informação completa não estiver disponível dentro do prazo de 72 horas, é submetida por fases, com a informação disponível nesse momento.

### Passo 6 — Remediação

Correção da causa raiz, verificação de que a contenção foi eficaz, e reforço das medidas preventivas relevantes.

### Passo 7 — Revisão Pós-Incidente

Documentação do incidente completo (linha temporal, causa, impacto, resposta, lições aprendidas) e revisão pela equipa dentro de 15 dias após o encerramento do incidente. Ajustes a este runbook, quando aplicável, são incorporados nesta Política.

## 4. Papéis e Responsabilidades

- **Responsável de segurança designado** — coordena a resposta ao incidente, decide sobre a necessidade de notificação, e é o ponto de contacto com autoridades de controlo.
- **Equipa técnica** — executa as ações de contenção e remediação.
- **Contacto de privacidade** ([privacidade@parvagas.pt](mailto:privacidade@parvagas.pt)) — gere comunicação com titulares de dados e autoridades.

## 5. Registo de Incidentes

Todo o incidente de severidade Média ou superior é registado de forma duradoura, independentemente de ter ou não gerado obrigação de notificação externa, para efeitos de responsabilização e de deteção de padrões recorrentes.

## 6. Formação e Sensibilização

A equipa com acesso administrativo à Plataforma deve estar familiarizada com esta Política e com a Política de Acesso e Operações Administrativas antes de lhe ser concedido acesso de produção.

## 7. Nota sobre Seguro de Responsabilidade Cibernética

À data de vigência desta Política, a **Parvagas (Usolu Tech Ltd) não detém uma apólice de seguro de responsabilidade cibernética dedicada**. Este documento descreve exclusivamente as medidas de segurança e o procedimento operacional de resposta a incidentes; não constitui, nem deve ser interpretado como, uma declaração de cobertura de seguro. Recomenda-se a avaliação da contratação de uma apólice adequada ao perfil de risco da Plataforma junto de uma seguradora licenciada, como medida complementar de gestão de risco. Caso venha a ser contratada, esta secção será atualizada com os termos de cobertura relevantes.
