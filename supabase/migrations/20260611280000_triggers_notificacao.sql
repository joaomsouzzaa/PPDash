-- Dispara as edge functions de notificação ao inserir vendas/leads.
-- (A anon key abaixo é pública por design; a function uazapi usa verify_jwt=false.)

create or replace function public.notificar_evento()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare
  corpo jsonb;
begin
  if TG_TABLE_NAME = 'vendas' then
    corpo := jsonb_build_object('action', 'nova_venda', 'venda', to_jsonb(NEW));
  elsif TG_TABLE_NAME = 'leads' then
    corpo := jsonb_build_object('action', 'novo_lead', 'lead', to_jsonb(NEW));
  else
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://wxxhsuprddzprnrwovwi.supabase.co/functions/v1/uazapi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGhzdXByZGR6cHJucndvdndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTk5NjAsImV4cCI6MjA5Njc3NTk2MH0.dUzaz0tcZKTPyVlKOwimKRKW05swtWvT2NWHe0AqTtA'
    ),
    body := corpo
  );
  return NEW;
end $$;

drop trigger if exists notificar_nova_venda on public.vendas;
create trigger notificar_nova_venda after insert on public.vendas
  for each row execute function public.notificar_evento();

drop trigger if exists notificar_novo_lead on public.leads;
create trigger notificar_novo_lead after insert on public.leads
  for each row execute function public.notificar_evento();
