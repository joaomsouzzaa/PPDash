-- ============================================================
-- Scraping Prospect (Growth): prospecção no Instagram com IA de social selling.
-- Página Growth → Scraping Prospect. Dois fluxos:
--   1) Scraping de seguidores de um perfil "isca" filtrado por nicho (médicos/estética).
--   2) Análise de 1 perfil colado direto (sem scraping).
-- Para cada perfil, uma IA analisa a bio, identifica se é empresa/pessoal, acha o @ da
-- empresa/clínica na bio, cruza com a base de produtos e gera uma mensagem de prospecção
-- em 2 partes (quebra). Operador revisa (aprova/descarta) antes de usar.
-- Isolamento por organização (RLS), igual às demais tabelas de cliente.
-- ============================================================

-- Base de conhecimento de produtos (CRUD na tela). A IA cruza cada perfil com esta lista.
create table if not exists public.prospect_produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  nome text not null,
  descricao text,                 -- o que resolve / oferta
  publico_alvo text,              -- quem é o cliente ideal
  gatilhos text[] not null default '{}', -- sinais no perfil que indicam fit
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cada rodada de scraping de seguidores.
create table if not exists public.prospect_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  perfil_isca text not null,      -- @ do perfil grande usado de isca
  nicho text not null,            -- 'medicos' | 'estetica' | ...
  status text not null default 'rodando', -- 'rodando' | 'concluido' | 'erro'
  total_encontrados int not null default 0,
  log text,                       -- resumo/custo/observações da rodada
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Um registro por perfil analisado (via scraping ou avulso).
create table if not exists public.prospect_analises (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  job_id uuid references public.prospect_jobs(id) on delete set null,
  handle text not null,           -- @ do perfil analisado
  nome text,
  bio text,
  foto_url text,
  is_business boolean,
  empresa_handle text,            -- @ da clínica/empresa achado na bio (se houver)
  niche_match boolean not null default false,
  segmento text,
  followers int,
  analise jsonb not null default '{}'::jsonb, -- { score, resumo, produtos_sugeridos[], sinais[] }
  mensagem_parte1 text,
  mensagem_parte2 text,
  status text not null default 'novo', -- 'novo' | 'aprovado' | 'descartado'
  origem text not null default 'avulso', -- 'scraping' | 'avulso'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists prospect_produtos_org_idx on public.prospect_produtos (org_id, ativo);
create index if not exists prospect_jobs_org_idx on public.prospect_jobs (org_id, created_at desc);
create index if not exists prospect_analises_org_idx on public.prospect_analises (org_id, created_at desc);
create index if not exists prospect_analises_job_idx on public.prospect_analises (job_id);
-- Evita duplicar o mesmo perfil dentro de um job (avulsos têm job_id nulo e não colidem).
create unique index if not exists prospect_analises_uniq on public.prospect_analises (org_id, handle, job_id);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão de 20260622160000_ig_auto_dm).
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['prospect_produtos','prospect_jobs','prospect_analises'];
begin
  foreach t in array tabelas
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);

    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_super_admin() or org_id = public.current_org_id()) '
      || 'with check (public.is_super_admin() or org_id = public.current_org_id());',
      t || '_org_isolation', t
    );

    -- preenche org_id automaticamente no insert (igual às demais tabelas)
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;

-- Nota: os produtos de exemplo (Consultoria de Franquias, Trilha Mentor) são semeados
-- POR ORG pelo frontend na 1ª visita (botão "Adicionar exemplos"), pois a RLS só expõe
-- linhas com org_id = current_org_id() — um seed global (org_id null) ficaria invisível.
