
ALTER TABLE public.vendas
  ADD COLUMN quantidade INTEGER DEFAULT 1,
  ADD COLUMN metodo_pagamento TEXT,
  ADD COLUMN cupom TEXT,
  ADD COLUMN utm_source TEXT,
  ADD COLUMN utm_medium TEXT,
  ADD COLUMN utm_campaign TEXT,
  ADD COLUMN utm_content TEXT,
  ADD COLUMN utm_term TEXT,
  ADD COLUMN documento TEXT,
  ADD COLUMN produtor TEXT;
