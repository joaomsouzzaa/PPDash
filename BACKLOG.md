# Backlog

## Personalizar e-mail de convite de equipe (Supabase Auth)

**Status:** pendente — depende de configurar SMTP próprio.

**Contexto:**
- O convite é enviado em `supabase/functions/admin/index.ts` (case `invite_member`) via
  `auth.admin.inviteUserByEmail`, que usa o template "Invite user" do Supabase Auth.
- Hoje o template está no padrão em inglês ("You've been invited") e o remetente é o do
  Supabase. Reclamação: e-mails sem personalização e às vezes não chegam (provedor padrão
  do Supabase tem limite baixo e cai em spam).
- Tentativa de editar o template via Management API (`PATCH /config/auth`) retornou:
  *"Email template modification is not available for free tier projects using the default
  email provider. Please upgrade your plan or configure a custom SMTP provider."*

**O que fazer (quando retomarmos):**
1. Escolher provedor de envio e obter credenciais (recomendado: **Resend** — free 3k/mês;
   alternativas: SendGrid/Brevo, Gmail App Password, ou upgrade do plano Supabase).
2. Verificar domínio/remetente no provedor.
3. Configurar SMTP no Supabase via Management API
   (`PATCH /v1/projects/wxxhsuprddzprnrwovwi/config/auth`: `smtp_host`, `smtp_port`,
   `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name`).
4. Aplicar o template PT-BR já desenhado (assunto "Seu convite para a GrowthStack" + HTML
   com marca GrowthStack, `{{ .Data.nome }}`, botão de aceite e link `{{ .ConfirmationURL }}`)
   em `mailer_subjects_invite` / `mailer_templates_invite_content`.
5. Testar enviando um convite real pela página Equipe.

> O HTML do template já foi prototipado nesta conversa (card escuro, accent `#ff2d75`).

---

## Integração Meta Lead Ads — pendências para liberar a CLIENTES

**Status:** funcionando para a conta do dono (papel no app). Falta liberar para contas de clientes.

**Contexto:**
- App Meta `Scale Dashboard` (ID `24154258840827764`). Webhook `leadgen` configurado, função
  `meta-leads` no ar, página Crepefy captando. Para a **conta do João (admin/papel no app)**
  já funciona em **Acesso Padrão** — leads reais entram automaticamente.
- Para **outros clientes** conectarem a própria conta, o Meta exige **Acesso Avançado**, que
  passa por App Review + Negócio verificado.

**O que está pendente (ação no painel do Meta, não no código):**
1. **Verificação do Negócio (BM)** — em análise (≈2 dias úteis). Bloqueia o resto.
2. **`leads_retrieval`** — solicitação de Acesso Avançado já enviada; aguardando o BM verificar.
3. **`pages_manage_metadata`** — só dá pra pedir Acesso Avançado após a 1ª chamada de API
   bem-sucedida (já disparada ao ativar a página Crepefy; o botão libera em até 24h).
4. Depois de aprovados: testar conexão com uma conta de cliente (sem papel no app) ponta a ponta.

**Verificar quando aprovado:**
- Reconectar a conta do cliente no painel (Integrações → Meta → Reconectar) e marcar a página.
- Confirmar que um lead real do cliente entra na tela de Leads (origem Meta) e dispara a
  notificação `novo_lead` (origem Meta/Ambos).

---

## Integração Meta — validar mapeamento de campos com lead real

**Status:** pendente de um lead real (teste foi com dados dummy do Meta).

- O mapeamento dos campos do formulário Crepfy está implementado em
  `supabase/functions/meta-leads/index.ts` (`mapMetaFields`). Bug do "Cidade pegando
  Capacidade" já corrigido (v2).
- Quando entrar o **primeiro lead real** do Meta, conferir campo a campo (nome, sobrenome,
  email, telefone, UF, capacidade de investimento) se caíram nas colunas certas. Ajustar
  `mapMetaFields` se algum formulário tiver nomes de campo diferentes.

---

## Meta Lead Ads — rodar sincronização histórica após liberar `pages_manage_ads`

**Status:** aguardando permissão do Meta (≈24h após a 1ª solicitação, feita em 2026-06-18).

**Contexto:**
- A edge function `meta-leads-sync` (pull) já está no ar e o cron diário `meta-leads-sync-diario`
  (8h BRT) também. O smoke test retorna o aviso `Requires pages_manage_ads` porque o token da
  página ainda não tem essa permissão para **listar formulários**. `leads_retrieval` já está ok.

**O que fazer quando liberar:**
1. Reconectar a página do Meta concedendo `pages_manage_ads` (+ `leads_retrieval`).
2. Rodar a sincronização histórica da Crepfy: `POST /functions/v1/meta-leads-sync`
   body `{"org_id":"58a4b4c2-1298-4535-ad21-2dac93fcd718","dias":18}`.
3. Validar em `leads`: faltantes inseridos e existentes sem rastreio enriquecidos
   (`utm_campaign/utm_content/utm_medium`). Conferir CAC por criativo.
4. Avisar o João para validarmos juntos.
