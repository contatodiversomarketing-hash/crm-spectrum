
-- Add file attachment columns to treinamento_ia
ALTER TABLE public.treinamento_ia 
ADD COLUMN anexo_url TEXT,
ADD COLUMN anexo_tipo TEXT,
ADD COLUMN anexo_nome TEXT,
ADD COLUMN anexo_conteudo_extraido TEXT;

-- Create storage bucket for training files
INSERT INTO storage.buckets (id, name, public) VALUES ('treinamento-arquivos', 'treinamento-arquivos', true);

-- Allow authenticated users to upload to training bucket
CREATE POLICY "Authenticated users can upload training files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'treinamento-arquivos');

-- Allow public read of training files
CREATE POLICY "Public read training files"
ON storage.objects FOR SELECT
USING (bucket_id = 'treinamento-arquivos');

-- Allow authenticated users to delete training files
CREATE POLICY "Authenticated users can delete training files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'treinamento-arquivos');
