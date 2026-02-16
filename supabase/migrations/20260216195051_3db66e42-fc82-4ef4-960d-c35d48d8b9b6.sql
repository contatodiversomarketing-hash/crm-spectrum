
CREATE TABLE public.voice_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  role text NOT NULL,
  message text NOT NULL,
  call_sid text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access voice_memory" ON public.voice_memory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read voice_memory" ON public.voice_memory FOR SELECT USING (true);

CREATE INDEX idx_voice_memory_phone ON public.voice_memory (phone_number, created_at DESC);
