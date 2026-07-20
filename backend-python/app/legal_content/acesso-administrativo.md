**Documento de uso interno.** Define as regras de acesso administrativo à plataforma Parvagas (**Usolu Tech Ltd**, NIF 5001246658, Luanda, Angola), os limites das ações permitidas por nível de acesso, e os procedimentos de auditoria. Destina-se a ser partilhado com colaboradores com funções administrativas antes da concessão de acesso de produção.

## 1. Níveis de Acesso Administrativo

A Plataforma implementa dois níveis de administração com permissões distintas:

| Nível | Permissões Incluídas | Permissões Excluídas |
|---|---|---|
| **Moderador** | Ver dashboard e analytics; moderar vagas (aprovar/rejeitar); criar/editar/rever vagas obtidas por agregação automática; verificar e rejeitar empresas; ver CVs de candidatos para fins de moderação | Suspender/reativar utilizadores ou empresas; criar/gerir campanhas publicitárias; promover/remover administradores; alterar interruptores de funcionalidade (*feature flags*); forçar termo de sessão de outro utilizador; exportar bases de dados completas; aceder a configuração do scraper; gerir disputas de pagamento |
| **Super-Admin** | Todas as permissões da Plataforma, incluindo as excluídas ao Moderador acima | Não pode suspender a própria conta |

## 2. Regras de Conduta para Administradores

### 2.1 Acesso a Dados Pessoais

O acesso a dados pessoais de candidatos (incluindo CVs) deve ser realizado apenas para fins operacionais legítimos (moderação, suporte, investigação de incidentes). É proibido aceder a dados pessoais por curiosidade ou para uso pessoal. O acesso a CVs de candidatos é registado nos registos de auditoria. Os dados pessoais acedidos não podem ser copiados, partilhados ou utilizados fora da Plataforma.

### 2.2 Suspensão de Utilizadores

A suspensão de utilizadores é uma ação exclusiva do Super-Admin e requer: indicação de motivo documentado e rastreável; registo automático no log de auditoria; e notificação ao utilizador suspenso com indicação do motivo. Não é permitido suspender a própria conta. Suspensões automáticas em massa requerem aprovação prévia da direção.

### 2.3 Moderação de Vagas e Empresas

Rejeições de vagas ou empresas devem ser acompanhadas de motivo claro. Transições de estado de empresa devem respeitar o fluxo definido (ex.: `rejected → pending_verification → active`). Vagas obtidas por agregação automática de fontes externas nunca devem ser publicadas sem revisão administrativa prévia.

### 2.4 Gestão de Anúncios

A criação e gestão de campanhas publicitárias é exclusiva do Super-Admin. Anúncios devem ser claramente identificados como publicidade na Plataforma. Não são permitidos anúncios baseados em perfis sensíveis de candidatos.

### 2.5 Exportações de Dados

Exportações de CSVs de utilizadores, vagas, empresas, transações e assinantes da newsletter são reservadas ao Super-Admin. Exportações devem ter finalidade documentada. Os ficheiros exportados devem ser tratados com confidencialidade e eliminados após uso.

### 2.6 Gestão de Fontes de Recolha Automática (Scraper)

A configuração de fontes de recolha automática de vagas (URL, tipo de fonte) é exclusiva do Super-Admin, dado o risco de segurança associado (o sistema efetua pedidos HTTP de saída para a URL configurada). Toda a configuração de fonte é validada contra endereços internos/privados antes de ser guardada e novamente antes de cada execução.

### 2.7 Gestão de Disputas de Pagamento

A gestão de disputas de pagamento (revisão, resolução, emissão de reembolso) é exclusiva do Super-Admin, nos termos do procedimento interno de resposta a reclamações. Toda a decisão sobre uma disputa é documentada com motivo e registada no log de auditoria.

## 3. Auditoria e Rastreabilidade

Todas as ações administrativas relevantes são registadas automaticamente com: identificador do administrador que realizou a ação; tipo de ação (ex.: `user.suspend`, `job.moderate`, `company.verification.update`, `dispute.resolve`); entidade afetada; motivo, quando aplicável; e data/hora. Estes registos são conservados nos termos da Política de Retenção de Dados e não podem ser alterados ou eliminados por administradores, incluindo Super-Admins.

## 4. Concessão e Revogação de Acesso

O acesso administrativo é concedido apenas a colaboradores com necessidade funcional comprovada, mediante aprovação de um Super-Admin existente. O acesso é revogado imediatamente na cessação da relação de trabalho ou de prestação de serviços, ou sempre que deixe de existir necessidade funcional.

## 5. Formação Prévia

Nenhum colaborador recebe acesso administrativo de produção sem ter previamente tomado conhecimento desta Política e da Política de Segurança e Notificação de Incidentes.
