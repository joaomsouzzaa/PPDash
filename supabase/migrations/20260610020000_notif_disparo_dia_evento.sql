-- Disparo extra de notificação NO DIA do evento, só da cidade cujo evento é hoje.
-- Além do horário programado normal (ex.: 9h, todas as cidades ativas).
alter table public.notificacoes add column if not exists disparo_dia_evento boolean not null default false;
alter table public.notificacoes add column if not exists horario_evento text default '12:00';
