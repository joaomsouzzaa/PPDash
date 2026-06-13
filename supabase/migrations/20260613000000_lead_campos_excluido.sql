-- Permite EXCLUIR de vez um campo padrão por organização.
-- excluido=true remove o campo da lista (deixa de ser tratado como padrão do sistema);
-- a chave fica livre para ser recriada como campo personalizado.
alter table public.lead_campos
  add column if not exists excluido boolean not null default false;
