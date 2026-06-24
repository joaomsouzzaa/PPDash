-- ============================================================
-- Vídeo Editor (Growth): fila de cortes de vídeo por IA.
-- A página sobe o vídeo no bucket público "video-editor" e cria
-- um registro em video_jobs. Um serviço Python externo (video-use)
-- processa o corte de forma assíncrona e grava o resultado de volta
-- (resultado_url / status). RLS por org, mesmo padrão das demais tabelas.
-- ============================================================

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  created_by uuid,
  nome text,                                        -- nome amigável (arquivo de origem)
  video_url text not null,                          -- vídeo de entrada (bucket video-editor)
  brief text,                                       -- instrução de corte (ex.: "remova pausas")
  status text not null default 'pendente',          -- 'pendente' | 'processando' | 'pronto' | 'erro'
  resultado_url text,                               -- vídeo cortado (final.mp4)
  edl jsonb,                                         -- decisão de corte (auditoria/debug)
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_jobs_org_idx on public.video_jobs (org_id, created_at desc);
create index if not exists video_jobs_status_idx on public.video_jobs (status);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão das demais tabelas de cliente)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['video_jobs'];
begin
  foreach t in array tabelas
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
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
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Bucket público para os vídeos (entrada + resultado), como artes-tarefas.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('video-editor', 'video-editor', true)
on conflict (id) do nothing;

-- Recria as policies de Storage incluindo o bucket video-editor (leitura pública,
-- escrita apenas na pasta da própria org). Mantém os buckets já existentes.
drop policy if exists buckets_publicos_read on storage.objects;
drop policy if exists buckets_org_insert on storage.objects;
drop policy if exists buckets_org_update on storage.objects;
drop policy if exists buckets_org_delete on storage.objects;

create policy buckets_publicos_read on storage.objects for select
  using (bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados','video-editor'));

create policy buckets_org_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados','video-editor')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_update on storage.objects for update to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados','video-editor')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados','video-editor')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );
