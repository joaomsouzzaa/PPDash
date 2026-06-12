-- Isolamento de Storage por organização.
-- Leitura permanece pública (URLs públicas seguem funcionando na UI), mas a
-- ESCRITA só é permitida dentro da pasta da própria organização: o primeiro
-- nível do caminho do arquivo precisa ser o org_id de quem envia.
-- (service_role/edge functions continuam podendo escrever — RLS não se aplica a elas.)

drop policy if exists buckets_publicos_write on storage.objects;
drop policy if exists buckets_publicos_read on storage.objects;

create policy buckets_publicos_read on storage.objects for select
  using (bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados'));

create policy buckets_org_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_update on storage.objects for update to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );
