**Documento de uso interno.** Procedimento operacional (SOP) para o tratamento de disputas de pagamento — reclamações de utilizadores relativas a uma transação (cobrança indevida, serviço não prestado, pedido de reembolso, suspeita de fraude), submetidas através da conta ou por [suporte@parvagas.pt](mailto:suporte@parvagas.pt). Complementa a [Política de Reembolsos e Cancelamento](/reembolsos) (regras de fundo) e o Modelo de Resposta a Disputas (textos de comunicação).

Uma vez que os pagamentos na Plataforma são processados através de redes de pagamento locais (Multicaixa Express, Unitel Money, transferência bancária) e não através de redes de cartão internacionais, **não existe um mecanismo automático de "chargeback"** iniciado pelo banco do utilizador — toda a disputa é aberta e resolvida diretamente através deste fluxo.

## 1. Estados de uma Disputa

```
open → under_review → (responded ↔ under_review) → resolved
                                                    → refunded
                                                    → rejected
```

| Estado | Significado |
|---|---|
| `open` | Disputa recebida, ainda não atribuída/analisada |
| `under_review` | Em análise pela equipa |
| `responded` | Aguarda resposta do utilizador (pedido de informação enviado) |
| `resolved` | Encerrada sem alteração de valor (ex.: esclarecimento aceite) |
| `refunded` | Encerrada com reembolso (total ou parcial) processado |
| `rejected` | Encerrada sem reembolso, com motivo documentado |

## 2. Passo 1 — Receção (Intake)

Toda a disputa é registada com, no mínimo: referência da transação; utilizador; canal de pagamento; motivo declarado; e prova/evidência inicial submetida pelo utilizador. Estado inicial: `open`. O Modelo A (Acusação de Receção) é enviado imediatamente.

**SLA:** confirmação de receção em até 1 dia útil.

## 3. Passo 2 — Triagem e Classificação

O caso é classificado por tipo:

- **Erro de cobrança** (cobrança duplicada, valor incorreto) — geralmente resolúvel por verificação direta nos registos internos, sem necessidade de informação adicional do utilizador.
- **Serviço não prestado / indisponibilidade** — requer verificação de logs/registos de disponibilidade do serviço no período reclamado.
- **Pedido de reembolso dentro do prazo de resolução** (candidatos, primeiros 14 dias) — verificação direta da elegibilidade nos termos da Política de Reembolsos.
- **Contestação de cobrança / desconhecimento da transação** — possível indício de fraude; escalar de imediato para verificação de segurança adicional.
- **Insatisfação com o serviço** (fora das exceções da Política de Reembolsos) — habitualmente não elegível para reembolso; requer resposta clara com fundamento na política.

Estado passa a `under_review`.

**SLA:** triagem concluída em até 2 dias úteis após receção.

## 4. Passo 3 — Investigação

Consoante a classificação:

- Confirmar o estado real da transação nos registos internos (referência, valor, estado, data);
- Verificar o histórico de atividade da conta associada no período relevante;
- Quando aplicável, solicitar ao utilizador comprovativo do pagamento efetuado (Modelo B), especialmente em disputas envolvendo transferência bancária ou referência manual, onde a confirmação de pagamento pode não ser automática;
- Em caso de suspeita de fraude ou utilização não autorizada do meio de pagamento, verificar os eventos de segurança da conta e, se necessário, suspender temporariamente a conta preventivamente enquanto decorre a investigação, nos termos da Política de Acesso e Operações Administrativas.

Uma disputa pode alternar entre `under_review` e `responded` várias vezes enquanto se aguarda ou processa informação adicional.

**SLA:** decisão preliminar em até 5 dias úteis após receção (compromisso comunicado ao utilizador no Modelo A).

## 5. Passo 4 — Decisão

A decisão é tomada exclusivamente por um Super-Admin (nos termos da Política de Acesso e Operações Administrativas) e enquadrada sempre na [Política de Reembolsos e Cancelamento](/reembolsos):

- **Reembolso total** → estado `refunded`; regista-se o registo de reembolso associado à transação; revoga-se ou ajusta-se o acesso concedido, se aplicável; envia-se o Modelo C.
- **Reembolso parcial** → estado `refunded`; mesmo procedimento, com justificação explícita do valor parcial; envia-se o Modelo D.
- **Sem alteração / esclarecimento aceite** → estado `resolved`; nenhum valor é alterado.
- **Rejeitado** → estado `rejected`; envia-se o Modelo E com o motivo fundamentado na política aplicável.
- **Sem resposta do utilizador** após pedido de informação, decorridos 10 dias úteis → estado `rejected` (ou `resolved`, consoante o caso), com envio do Modelo F; o caso pode ser reaberto a pedido do utilizador com nova informação.

Toda a decisão é registada com: motivo, elementos considerados, e identificação do administrador responsável — no log de auditoria e na própria disputa.

## 6. Passo 5 — Comunicação e Encerramento

O utilizador é notificado da decisão através do modelo aplicável (Secção 5 acima). O caso é encerrado apenas depois de a comunicação ter sido enviada e, quando aplicável, o reembolso confirmado como processado.

## 7. Passo 6 — Monitorização de Taxa de Disputas

Todas as disputas resolvidas (independentemente do resultado) contam para o cálculo da taxa de disputas por fornecedor de pagamento e global, monitorizada automaticamente. Quando esta taxa ultrapassa o limiar configurado, é gerado um alerta de segurança de severidade elevada e uma notificação à equipa — nos termos da Política de Segurança e Notificação de Incidentes. Uma taxa de disputas anormalmente elevada associada a um fornecedor ou período específico é tratada como um possível incidente de segurança ou de fraude, não apenas como uma questão de apoio ao cliente, e escalada em conformidade.

## 8. Escalonamento

Qualquer disputa envolvendo: valor superior a 500.000 AOA; suspeita fundamentada de fraude; ou risco reputacional (ex.: ameaça de exposição pública) é escalada de imediato a um Super-Admin sénior, independentemente do estado do SLA normal.
