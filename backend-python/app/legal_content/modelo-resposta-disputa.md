**Documento de uso interno.** Modelo de resposta estruturada para utilização pela equipa de suporte/administração ao responder a uma disputa de pagamento aberta por um utilizador, nos termos do procedimento definido na Política de Fluxo de Resolução de Disputas de Pagamento. Os campos entre `{{chavetas}}` são preenchidos automaticamente a partir dos dados da transação e da disputa antes do envio; o texto restante pode ser ajustado pelo administrador consoante o caso concreto, mantendo sempre um tom profissional e factual.

---

## Modelo A — Acusação de Receção (envio automático ou imediato)

> Assunto: Recebemos a sua reclamação sobre a transação {{referencia_transacao}}
>
> Olá {{nome_utilizador}},
>
> Confirmamos a receção do seu pedido relativo à transação **{{referencia_transacao}}**, no valor de **{{montante}} {{moeda}}**, submetida a {{data_transacao}}.
>
> Motivo indicado: {{motivo_disputa}}
>
> A nossa equipa vai analisar o caso e voltaremos a contactá-lo no prazo máximo de **5 dias úteis** com uma decisão ou com um pedido de informação adicional. Pode acompanhar o estado deste pedido a qualquer momento na sua conta.
>
> Obrigado pela paciência.
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

## Modelo B — Pedido de Informação Adicional

> Assunto: Precisamos de mais informação sobre a sua reclamação {{referencia_transacao}}
>
> Olá {{nome_utilizador}},
>
> Para prosseguirmos com a análise da sua reclamação sobre a transação {{referencia_transacao}}, agradecemos que nos envie:
>
> - {{lista_documentos_solicitados}}
>
> Pode responder diretamente a este email ou anexar os documentos na sua conta. Assim que recebermos a informação, retomamos a análise dentro de 3 dias úteis.
>
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

## Modelo C — Disputa Resolvida a Favor do Utilizador (Reembolso Total)

> Assunto: A sua reclamação foi resolvida — reembolso processado
>
> Olá {{nome_utilizador}},
>
> Analisámos a sua reclamação sobre a transação {{referencia_transacao}} e confirmámos: {{resumo_da_conclusao}}.
>
> Foi processado um reembolso total de **{{montante_reembolsado}} {{moeda}}**, através de {{metodo_reembolso}}. O prazo estimado de receção é de até 10 dias úteis.
>
> {{ajustes_de_acesso_se_aplicavel}}
>
> Pedimos desculpa pelo incómodo causado.
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

## Modelo D — Disputa Resolvida com Reembolso Parcial

> Assunto: A sua reclamação foi resolvida — reembolso parcial processado
>
> Olá {{nome_utilizador}},
>
> Analisámos a sua reclamação sobre a transação {{referencia_transacao}}. Com base em {{resumo_da_conclusao}}, foi processado um reembolso parcial de **{{montante_reembolsado}} {{moeda}}** (de um total de {{montante_original}} {{moeda}}), através de {{metodo_reembolso}}.
>
> {{justificacao_do_valor_parcial}}
>
> Se tiver questões adicionais sobre esta decisão, pode responder diretamente a este email.
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

## Modelo E — Disputa Rejeitada

> Assunto: Resposta à sua reclamação sobre a transação {{referencia_transacao}}
>
> Olá {{nome_utilizador}},
>
> Analisámos cuidadosamente a sua reclamação sobre a transação {{referencia_transacao}}. Após revisão de {{elementos_analisados}}, concluímos que {{motivo_da_rejeicao}}, nos termos da nossa [Política de Reembolsos e Cancelamento](/reembolsos).
>
> Não foi por isso possível processar um reembolso neste caso. Se dispuser de informação adicional que não tenha ainda partilhado connosco, pode responder a este email e reabriremos a análise.
>
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

## Modelo F — Caso Encerrado por Falta de Resposta

> Assunto: Encerramos a sua reclamação {{referencia_transacao}} por falta de resposta
>
> Olá {{nome_utilizador}},
>
> Não recebemos a informação solicitada em {{data_do_pedido}} sobre a sua reclamação relativa à transação {{referencia_transacao}}. Por esse motivo, encerramos o caso nesta data.
>
> Se pretender retomar a análise, pode responder a este email a qualquer momento com a informação em falta e reabriremos o processo.
>
> Equipa Parvagas — [suporte@parvagas.pt](mailto:suporte@parvagas.pt)

---

### Notas de utilização (não enviar ao utilizador)

- Nunca prometer um resultado antes da decisão estar tomada e registada no sistema.
- `{{montante_reembolsado}}` deve corresponder exatamente ao valor processado no registo do reembolso — nunca um valor arredondado ou estimado.
- Qualquer desvio significativo destes modelos deve ser revisto por um Super-Admin antes do envio.
