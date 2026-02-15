
-- Tabela de leads recebidos via CRM
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'lead',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  produto_slug TEXT,
  cidade TEXT,
  origem TEXT,
  payload JSONB,
  data_lead TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Policies (public read, service_role insert)
CREATE POLICY "Permitir leitura de leads" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Insert via service role only" ON public.leads FOR INSERT WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Permitir atualização de leads" ON public.leads FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de leads" ON public.leads FOR DELETE USING (true);
