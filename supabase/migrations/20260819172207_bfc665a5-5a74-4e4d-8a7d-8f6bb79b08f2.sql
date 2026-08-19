UPDATE public.interacoes_ia
SET paciente_externo_id = '55' || regexp_replace(paciente_externo_id, '\D', '', 'g')
WHERE canal = 'whatsapp'
  AND paciente_externo_id ~ '^\+?\d{10,11}$'
  AND left(regexp_replace(paciente_externo_id, '\D', '', 'g'), 2) <> '55';