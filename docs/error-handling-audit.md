# Auditoria de Tratamento de Erros (Estado Atual)

## Escopo auditado
- Formulários públicos: Login, Signup, Recuperação de password, Submissão de CV.
- Listagens e páginas públicas: Vagas disponíveis, fallback 404/500.
- Erros globais: error boundary de rota e global.
- Camada API: apiFetch e ApiError.

## Inconsistências encontradas antes da unificação
1. Estilo visual inconsistente:
- Alguns erros eram texto simples (`text-red-600`) sem ícone nem reforço semântico.
- Outros erros apareciam como toast com estilos diferentes e sem hierarquia clara de severidade.

2. Posicionamento inconsistente:
- Erros de formulário apareciam apenas em toast global, longe do campo com falha.
- Erros de rede e sessão não tinham padrão estável de topo (banner).

3. Mensagens e tom:
- Mistura de mensagens técnicas (incluindo fallback HTTP) com mensagens orientadas ao utilizador.
- Presença de conteúdo em inglês em alguns fluxos, contrariando a consistência linguística.

4. Comportamento:
- Ausência de diferenciação formal entre aviso suave, erro de validação e erro crítico.
- Falhas de rede/API não eram sempre encaminhadas para um handler global.

5. Fallbacks de navegação:
- Não havia página `not-found` amigável com caminho de recuperação.
- Página 500 não oferecia busca nem ações explícitas de continuidade.

## Padrão implementado
- FormFieldError: erro adjacente ao campo, com ícone e texto forte.
- ToastError: erro transitório não bloqueante com ação opcional de retry.
- BannerError: problemas de sessão/rede no topo com CTA.
- ModalError: falha crítica bloqueante com próximos passos.
- Handler central: captura de `error`/`unhandledrejection` e roteamento para UI adequada.
- API centralizada: falhas de rede/5xx encaminhadas para banner/modal global.

## Observações
- O sistema preserva dados digitados quando há erro.
- Erros só aparecem após interação/submit nos fluxos atualizados.
- Idioma fixado em português com flag para reativação futura de i18n.
