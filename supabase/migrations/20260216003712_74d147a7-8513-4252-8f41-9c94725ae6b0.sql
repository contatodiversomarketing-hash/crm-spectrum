
CREATE TABLE public.call_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid TEXT NOT NULL,
  recording_url TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  analyzed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_recordings" ON public.call_recordings FOR SELECT USING (true);
CREATE POLICY "Service role full access call_recordings" ON public.call_recordings FOR ALL USING (true) WITH CHECK (true);
