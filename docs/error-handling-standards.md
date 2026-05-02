# Padrões de Erro e Modo Português

## Modo de idioma (temporário)
- Flag: `ENABLE_I18N` em `src/config/appConfig.ts`.
- Estado atual: `false` (apenas português).
- Locale padrão: `pt`.
- Seletores de idioma ficam ocultos quando a flag está desativada.

## Biblioteca de UI de erro
- `FormFieldError`: validação de campo, junto ao input.
- `ToastError`: aviso curto e não bloqueante.
- `BannerError`: falha de sessão/rede com ação clara.
- `ModalError`: erro crítico que interrompe o fluxo.

## Diretrizes de escrita
- Evitar termos técnicos para utilizador final.
- Explicar o problema + próximo passo em uma frase objetiva.
- Nunca culpar o utilizador.
- Exibir código de suporte apenas em contexto de suporte.

## Severidade
- Baixa (aviso): toast.
- Média (fluxo degradado): banner.
- Alta (bloqueante): modal.

## Timing de validação
- Não mostrar erro em campos antes de interação.
- Exibir após `blur` ou após tentativa de submissão.

## Preservação de dados
- Nunca limpar dados ao falhar validação.
- Limpar apenas em sucesso explícito ou ação de reset do utilizador.

## Integração técnica
- Provedor global: `AppNotifierProvider`.
- Roteamento API/UI: `src/lib/api.ts` + `src/lib/errorBridge.ts`.
- Monitorização: `src/lib/errorMonitoring.ts` (endpoint opcional `NEXT_PUBLIC_ERROR_LOG_ENDPOINT`).
