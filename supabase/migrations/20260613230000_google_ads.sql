-- Integração Google Ads: canal de aquisição pode ser Meta ou Google.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS plataforma text NOT NULL DEFAULT 'meta';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS google_conta_id text;
-- ID da conta gerenciadora (MCC) usada no header login-customer-id da Google Ads API.
ALTER TABLE public.google_config ADD COLUMN IF NOT EXISTS ads_login_customer_id text;
