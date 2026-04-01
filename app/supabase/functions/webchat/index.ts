import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
  const PINECONE_HOST = "backstagefy-knowledge-s882eud.svc.aped-4627-b74a.pinecone.io";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    // Required: tenant_id, message
    // Optional: session_id (to persist conversation), visitor_name, visitor_email
    const { tenant_id, message, audio_base64, audio_mime, session_id, visitor_name, visitor_email } = body;

    if (!tenant_id || (!message && !audio_base64)) {
      return new Response(JSON.stringify({ error: "tenant_id e message (ou audio_base64) são obrigatórios" }), { status: 400, headers: CORS });
    }

    // --- Load tenant agent config ---
    const { data: agent } = await supabase
      .from("agents")
      .select("system_prompt, model, temperature")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const systemPrompt = agent?.system_prompt || "Você é um assistente prestativo. Responda de forma cordial e profissional.";
    const aiModel = agent?.model || "gpt-4o-mini";
    const temperature = agent?.temperature ?? 0.4;

    // --- Resolve or create webchat session ---
    let sessionId = session_id;
    let leadId: string | null = null;

    if (sessionId) {
      const { data: sess } = await supabase
        .from("webchat_sessions")
        .select("id, lead_id")
        .eq("id", sessionId)
        .eq("tenant_id", tenant_id)
        .maybeSingle();

      if (sess) {
        leadId = sess.lead_id;
      } else {
        sessionId = null; // invalid session, will create new one
      }
    }

    if (!sessionId) {
      // Create lead if visitor info provided
      if (visitor_name || visitor_email) {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("corporate_email", visitor_email || "")
          .maybeSingle();

        if (existingLead) {
          leadId = existingLead.id;
        } else {
          const { data: newLead } = await supabase
            .from("leads")
            .insert({
              name: visitor_name || null,
              corporate_email: visitor_email || null,
              status: "frio",
              source: "webchat",
            })
            .select("id")
            .single();
          leadId = newLead?.id || null;
        }
      }

      const { data: newSession } = await supabase
        .from("webchat_sessions")
        .insert({ tenant_id, lead_id: leadId })
        .select("id")
        .single();

      sessionId = newSession?.id || crypto.randomUUID();
    }

    // --- Transcribe audio if provided ---
    let userMessage = message || "";
    if (audio_base64 && OPENAI_API_KEY) {
      try {
        const mimeType = audio_mime || "audio/webm";
        const ext      = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const binary   = atob(audio_base64);
        const bytes    = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const audioBlob = new Blob([bytes], { type: mimeType });

        const fd = new FormData();
        fd.append("file",  audioBlob, `audio.${ext}`);
        fd.append("model", "whisper-1");
        fd.append("language", "pt");

        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: fd,
        });

        if (whisperRes.ok) {
          const whisperData = await whisperRes.json();
          userMessage = whisperData.text || "[Áudio não transcrito]";
        } else {
          userMessage = "[Áudio recebido, mas não foi possível transcrever]";
        }
      } catch (_) {
        userMessage = "[Erro ao processar áudio]";
      }
    }

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Mensagem vazia" }), { status: 400, headers: CORS });
    }

    // --- Save incoming user message ---
    await supabase.from("webchat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: userMessage,
    });

    // --- Load history (last 10 turns) ---
    const { data: history } = await supabase
      .from("webchat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);

    const historyItems = (history || []).reverse().map((h: any) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));

    // --- RAG: Retrieve knowledge from Pinecone ---
    let knowledgeContext = "";
    if (GEMINI_API_KEY && PINECONE_API_KEY) {
      try {
        const embedRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/text-embedding-004",
              content: { parts: [{ text: message }] },
              taskType: "RETRIEVAL_QUERY",
            }),
          }
        );

        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const queryVector = embedData.embedding?.values;

          if (queryVector) {
            const pineconeRes = await fetch(`https://${PINECONE_HOST}/query`, {
              method: "POST",
              headers: { "Api-Key": PINECONE_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                vector: queryVector,
                topK: 5,
                includeMetadata: true,
                namespace: tenant_id,
              }),
            });

            if (pineconeRes.ok) {
              const pineconeData = await pineconeRes.json();
              const relevant = (pineconeData.matches || [])
                .filter((m: any) => m.score > 0.5)
                .map((m: any) => m.metadata?.content || "")
                .filter((c: string) => c.length > 0);

              if (relevant.length > 0) {
                knowledgeContext = `\n[BASE DE CONHECIMENTO]\n${relevant.join("\n---\n")}\n`;
              }
            }
          }
        }
      } catch (_) {
        // RAG failure is non-fatal
      }
    }

    const nowBR = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const messages = [
      {
        role: "system",
        content: systemPrompt + knowledgeContext + `\n\nData/Hora Atual: ${nowBR}`,
      },
      ...historyItems,
      // Ensure current message is included (history fetch may lag by one)
      { role: "user" as const, content: userMessage },
    ];

    // --- Call OpenAI ---
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada" }), { status: 500, headers: CORS });
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModel, messages, temperature }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: "Erro na IA", detail: errText }), { status: 500, headers: CORS });
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";

    // --- Save assistant reply ---
    await supabase.from("webchat_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: reply,
    });

    // --- Update lead info if provided in this request ---
    if (leadId && (visitor_name || visitor_email)) {
      const updates: any = {};
      if (visitor_name) updates.name = visitor_name;
      if (visitor_email) updates.corporate_email = visitor_email;
      await supabase.from("leads").update(updates).eq("id", leadId);
    }

    return new Response(
      JSON.stringify({ reply, session_id: sessionId }),
      { headers: CORS }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "Erro interno", detail: e.message }),
      { status: 500, headers: CORS }
    );
  }
});
