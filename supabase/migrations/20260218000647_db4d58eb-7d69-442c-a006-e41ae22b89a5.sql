ALTER TABLE public.leads ADD COLUMN is_venda_realizada TEXT DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN faturamento_venda NUMERIC DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN data_venda_realizada TIMESTAMP WITH TIME ZONE DEFAULT NULL;