import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { audio, format } = await req.json();
    if (!audio || typeof audio !== 'string') {
      return new Response(JSON.stringify({ error: 'Áudio não enviado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'Você transcreve ditados clínicos em português do Brasil. Responda APENAS com a transcrição literal, bem pontuada, sem comentários.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva este áudio.' },
              { type: 'input_audio', input_audio: { data: audio, format: format || 'webm' } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const details = await resp.text();
      console.error('Gateway error', resp.status, details);
      return new Response(JSON.stringify({ error: 'Falha na transcrição', status: resp.status, details }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const texto = data?.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ texto }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
