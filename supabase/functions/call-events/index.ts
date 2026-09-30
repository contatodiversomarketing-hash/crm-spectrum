import { adminClient, processarGravacaoLigacao } from "../_shared/twilio.ts";

const MAP: Record<string, string> = {
  queued: "ringing", initiated: "ringing", ringing: "ringing",
  "in-progress": "in_progress", answered: "in_progress",
  completed: "completed", busy: "busy", "no-answer": "no_answer", failed: "failed", canceled: "failed",
};
const TERMINAIS = ["completed", "busy", "no_answer", "failed"];
const ok = () => new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });

Deno.serve(async (req) => {
  try {
    const params = new URLSearchParams(await req.text());
    const all = Object.fromEntries(params.entries());
    const callId = new URL(req.url).searchParams.get("callId");
    const sb = adminClient();

    if (!callId) {
      // Fluxo antigo (automações de voz)
      await sb.from("logs_decisao").insert({ evento: "call_status_event", decisao: all.CallStatus ?? "", confianca: 1, dados_entrada: all });
      return ok();
    }

    await sb.from("call_events").insert({ call_id: callId, event: all.CallStatus || all.RecordingStatus || "evento", payload: all });
    const { data: call } = await sb.from("calls").select("*").eq("id", callId).maybeSingle();
    if (!call) return ok();

    const upd: Record<string, unknown> = {};
    let status = all.CallStatus ? MAP[all.CallStatus] : undefined;
    if (!status && all.RecordingUrl) status = "completed";
    // não regredir status terminal
    if (status && !TERMINAIS.includes(call.status)) upd.status = status;
    if (status === "in_progress" && !call.answered_at) upd.answered_at = new Date().toISOString();
    if (status && TERMINAIS.includes(status) && !call.ended_at) {
      const end = new Date();
      upd.ended_at = end.toISOString();
      const d = parseInt(all.DialCallDuration || all.CallDuration || "", 10);
      const base = call.answered_at ?? upd.answered_at;
      upd.duration_seconds = Number.isFinite(d) ? d : base ? Math.round((end.getTime() - new Date(base as string).getTime()) / 1000) : 0;
    }
    if (all.RecordingUrl && (all.RecordingStatus ?? "completed") === "completed") {
      upd.recording_url = all.RecordingUrl + ".mp3";
      if (all.RecordingDuration && !call.duration_seconds) upd.duration_seconds = parseInt(all.RecordingDuration, 10);
    }
    if (Object.keys(upd).length) await sb.from("calls").update(upd).eq("id", callId);

    if (upd.recording_url) {
      // @ts-ignore EdgeRuntime existe no runtime
      EdgeRuntime.waitUntil(processarGravacaoLigacao(callId));
    }
    return ok();
  } catch (e) {
    console.error("[call-events]", (e as Error).message);
    return ok();
  }
});
