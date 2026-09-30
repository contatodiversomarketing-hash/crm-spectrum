import { adminClient, normalizePhoneBR, twilioEnv, twiml, xmlEscape } from "../_shared/twilio.ts";

Deno.serve(async (req) => {
  try {
    const text = await req.text();
    let p: Record<string, string> = {};
    try { p = Object.fromEntries(new URLSearchParams(text)); } catch { /* */ }
    if (!p.To && text.trim().startsWith("{")) { try { p = JSON.parse(text); } catch { /* */ } }
    const q = Object.fromEntries(new URL(req.url).searchParams);
    p = { ...q, ...p };

    let to = (p.To ?? "").trim();
    if (to && !to.startsWith("+")) to = "+" + to;
    const destino = normalizePhoneBR(to);
    if (!destino) return twiml(`<Say language="pt-BR" voice="Polly.Camila">Erro: número de destino não fornecido.</Say><Hangup/>`);

    const sb = adminClient();
    const callSid = p.CallSid ?? null;
    let callId: string | null = null;
    if (callSid) {
      const { data } = await sb.from("calls").select("id").eq("twilio_call_sid", callSid).maybeSingle();
      callId = data?.id ?? null;
    }
    if (!callId) {
      const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
      const { data, error } = await sb.from("calls").insert({
        twilio_call_sid: callSid, phone_number: destino, direction: "outbound", status: "ringing",
        agent_user_id: uuid(p.agentUserId), lead_id: uuid(p.leadId), paciente_id: uuid(p.pacienteId),
        client_name: p.clientName || null, metadata: { source: "webrtc" },
      }).select("id").single();
      if (error) throw error;
      callId = data.id;
    }

    const cb = `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-events?callId=${callId}`;
    const e = twilioEnv();
    return twiml(
      `<Dial callerId="${xmlEscape(e.phone)}" answerOnBridge="true" record="record-from-answer-dual" timeout="60" ` +
      `recordingStatusCallback="${xmlEscape(cb)}" recordingStatusCallbackMethod="POST">` +
      `<Number statusCallback="${xmlEscape(cb)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${destino}</Number></Dial>`,
    );
  } catch (err) {
    console.error("[twilio-outbound-call]", (err as Error).message);
    return twiml("<Hangup/>");
  }
});
