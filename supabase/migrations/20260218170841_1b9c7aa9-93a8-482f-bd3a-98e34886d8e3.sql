
ALTER TABLE public.configuracoes_sistema 
ADD COLUMN whatsapp_ativo boolean NOT NULL DEFAULT true,
ADD COLUMN telefone_ativo boolean NOT NULL DEFAULT true;
