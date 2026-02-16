import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Alias: encaminha o callback do CRM para processar-gravacao
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    console.log("[voice-recording-callback] Encaminhando para processar-gravacao");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/processar-gravacao`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": req.headers.get("X-Twilio-Signature") || "",
      },
      body: bodyText,
    });

    const responseText = await res.text();
    return new Response(responseText, {
      status: res.status,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[voice-recording-callback] Erro:", error);
    return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }
});
