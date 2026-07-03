-- Deduplicação de leads por telefone normalizado.
-- Coluna gerada telefone_norm: remove não-dígitos, tira o código do país 55/+55
-- quando presente e mantém os últimos 11 dígitos (DDD + número). Mantém em
-- sincronia com a lógica de supabase/functions/_shared/telefone.ts.
alter table public.leads add column if not exists telefone_norm text
generated always as (
  nullif(
    right(
      case
        when length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) > 11
             and left(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 2) = '55'
        then substr(regexp_replace(telefone, '\D', '', 'g'), 3)
        else regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
      end,
      11
    ),
    ''
  )
) stored;

-- Índice único (org_id, telefone_norm). NÃO é parcial de propósito: um índice
-- parcial (WHERE telefone_norm IS NOT NULL) NÃO pode ser usado como arbiter de
-- ON CONFLICT pelo supabase-js (que não emite o predicado WHERE) → erro 42P10.
-- Como o Postgres trata NULL como distinto em índice único, leads só-e-mail
-- (telefone_norm NULL) continuam não colidindo entre si; a dedup por e-mail é
-- feita na aplicação. Rede de segurança para o caso da dedup de app falhar.
-- Rodar a limpeza (merge_leads_dups.cjs) ANTES desta migração, senão a criação
-- do índice falha por duplicatas.
create unique index if not exists leads_org_telefone_norm_uniq
  on public.leads (org_id, telefone_norm);
