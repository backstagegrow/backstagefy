const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SAMPLE = "Olá! Eu serei a voz da sua IA. Se me escolher, atenderei seus clientes com muito prazer!";
const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

Deno.serve(async (req) => {
  // Preflight — must return 200 with CORS headers, nothing else
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let voice = "onyx";
  try {
    const body = await req.json();
    if (VALID_VOICES.includes(body?.voice)) voice = body.voice;
  } catch (_) {}

  const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", input: SAMPLE, voice, response_format: "mp3" }),
  });

  if (!ttsRes.ok) {
    const err = await ttsRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBuffer.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
