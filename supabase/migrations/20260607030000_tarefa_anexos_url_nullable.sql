-- A url só existe DEPOIS da geração; o anexo nasce com status 'gerando' sem url.
-- A constraint NOT NULL fazia o insert inicial falhar (anexo nunca era criado).
alter table public.tarefa_anexos alter column url drop not null;
