CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_call_sid text UNIQUE,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+55[0-9]{10,11}$'),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  client_name text,
  agent_user_id uuid,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','in_progress','completed','failed','busy','no_answer')),
  duration_seconds integer,
  recording_url text,
  transcription text,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calls_select" ON public.calls FOR SELECT TO authenticated
  USING (agent_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisao'));
CREATE POLICY "calls_insert" ON public.calls FOR INSERT TO authenticated WITH CHECK (agent_user_id = auth.uid());
CREATE POLICY "calls_update" ON public.calls FOR UPDATE TO authenticated
  USING (agent_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "calls_delete" ON public.calls FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.call_events TO authenticated;
GRANT ALL ON public.call_events TO service_role;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_events_select" ON public.call_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND (c.agent_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisao'))));

CREATE TABLE public.consultant_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  agent_user_id uuid,
  nota_geral integer,
  rapport integer,
  objecoes integer,
  fechamento integer,
  cordialidade integer,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.consultant_scores TO authenticated;
GRANT ALL ON public.consultant_scores TO service_role;
ALTER TABLE public.consultant_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_select" ON public.consultant_scores FOR SELECT TO authenticated
  USING (agent_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisao'));

CREATE INDEX calls_created_idx ON public.calls(created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;