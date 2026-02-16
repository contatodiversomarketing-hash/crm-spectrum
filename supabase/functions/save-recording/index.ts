import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();

    const recordingUrl = formData.get("RecordingUrl") as string | null;
    const callSid = formData.get("CallSid") as string | null;
    const duration = formData.get("RecordingDuration") as string | null;

    if (!recordingUrl || !callSid) {
      console.warn("[save-recording] RecordingUrl ou CallSid ausente");
      return new Response("ok", { status: 200 });
    }

    console.log(`[save-recording] CallSid=${callSid} Duration=${duration}s`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("call_recordings").insert({
      call_sid: callSid,
      recording_url: recordingUrl + ".mp3",
      duration: parseInt(duration || "0", 10),
      analyzed: false,
    });

    if (error) {
      console.error("[save-recording] Erro ao inserir:", error.message);
    } else {
      console.log("[save-recording] Gravação salva com sucesso");
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[save-recording] Erro:", (error as Error).message);
    return new Response("ok", { status: 200 });
  }
});
