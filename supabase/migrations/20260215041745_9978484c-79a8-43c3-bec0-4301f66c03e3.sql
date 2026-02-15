
-- Tabela para armazenar vendas recebidas via webhook
CREATE TABLE public.vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plataforma TEXT NOT NULL, -- 'goexplosion' ou 'kiwify'
  id_transacao TEXT, -- ID da transação na plataforma
  status TEXT NOT NULL DEFAULT 'aprovada', -- aprovada, reembolsada, cancelada, etc.
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  nome_comprador TEXT,
  email_comprador TEXT,
  telefone_comprador TEXT,
  produto TEXT,
  tipo_ingresso TEXT, -- individual, dupla, vip, etc.
  cidade TEXT,
  data_venda TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payload JSONB, -- payload completo do webhook para referência
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS aberta para INSERT via service_role (edge function) e SELECT para leitura
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- Permitir leitura pública dos dados (dashboard sem auth por enquanto)
CREATE POLICY "Permitir leitura de vendas" ON public.vendas
  FOR SELECT USING (true);

-- Insert apenas via service_role (edge function usa service role key)
CREATE POLICY "Insert via service role" ON public.vendas
  FOR INSERT WITH CHECK (true);
