-- Personalização de marca por organização (logo + nome no app e na aba do navegador).
alter table public.organizations
  add column if not exists marca_nome text,
  add column if not exists marca_logo_url text;

-- Bucket público para os logos das marcas.
insert into storage.buckets (id, name, public)
  values ('branding', 'branding', true)
  on conflict (id) do nothing;

-- Leitura pública; escrita só na pasta da própria org (igual aos demais buckets).
drop policy if exists branding_read on storage.objects;
create policy branding_read on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists branding_org_insert on storage.objects;
create policy branding_org_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text));

drop policy if exists branding_org_update on storage.objects;
create policy branding_org_update on storage.objects for update to authenticated
  using (bucket_id = 'branding'
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text));

drop policy if exists branding_org_delete on storage.objects;
create policy branding_org_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text));
