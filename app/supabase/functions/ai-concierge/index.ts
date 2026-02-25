import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fallback lead for debug logs
    const DEBUG_LEAD = '585ef1db-7b6f-409a-83c6-70769817ae62';

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        // 1. RAW TRACE (Read as text first to avoid JSON crash)
        const rawBody = await req.text();

        try {
            await supabase.from('chat_history').insert({
                role: 'assistant',
                content: `[TRACE RAW] Hit! Method: ${req.method}\nBody: ${rawBody.substring(0, 500)}`,
                lead_id: DEBUG_LEAD
            });
        } catch (e) { console.error("Trace failed", e); }

        if (!rawBody) return new Response("Empty body", { status: 200 });

        const payload = JSON.parse(rawBody);
        const instanceId = payload.instanceId || payload.instanceName || payload.name;
        const msg = payload.message || payload.data || payload.body || payload;
        const remoteJid = msg.sender || msg.chatid || msg.remoteJid || "";

        const cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");

        if (!remoteJid || remoteJid.includes("status@broadcast") || !instanceId) {
            console.log("[HAUS] Ignored: ", { remoteJid, instanceId });
            return new Response("ignored", { status: 200 });
        }

        const isGroup = remoteJid.includes("@g.us");

        // 2. Fetch instance configuration
        const { data: instData } = await supabase
            .from('whatsapp_instances')
            .select('settings, apikey, user_id')
            .eq('instance_name', instanceId)
            .maybeSingle();

        const config = instData?.settings || {};
        const UAZ_KEY = instData?.apikey;
        const UAZ_BASE = Deno.env.get('UAZAPI_URL')?.replace(/\/$/, "");

        if (!UAZ_KEY) {
            const noKeyMsg = `[SYSTEM DEBUG] No API Key for instance ${instanceId}. Did you sync the table?`;
            console.warn(noKeyMsg);
            await supabase.from('chat_history').insert({ role: 'assistant', content: noKeyMsg, lead_id: DEBUG_LEAD });
            return new Response("no_apikey", { status: 200 });
        }

        // --- Guards ---
        if (isGroup && config.ignoreGroups) return new Response("ignored group", { status: 200 });

        if (config.whitelistEnabled) {
            const allowed = Array.isArray(config.whitelistNumbers) ? config.whitelistNumbers : [];
            if (allowed.length > 0 && !allowed.includes(cleanPhone)) return new Response("unauthorized", { status: 200 });
        }

        // 3. Lead & Chat Session
        let { data: lead } = await supabase.from('leads').select('*').eq('phone', cleanPhone).single();
        if (!lead) {
            const { data: newLead } = await supabase.from('leads').insert({ phone: cleanPhone, pipeline_stage: 'new', status: 'frio' }).select().single();
            lead = newLead;
        }

        let { data: chat } = await supabase.from('chats').select('id').eq('lead_id', lead.id).eq('status', 'open').limit(1).maybeSingle();
        if (!chat) {
            const { data: newChat } = await supabase.from('chats').insert({ lead_id: lead.id, status: 'open' }).select('id').single();
            chat = newChat;
        }
        const chatId = chat?.id || null;

        // 4. Audio Transcription
        let isAudio = msg.type === 'audio' || msg.type === 'ptt' || payload.type === 'audio';
        let audioText = "";
        if (isAudio) {
            const mediaUrl = msg.mediaUrl || msg.url || payload.url;
            if (mediaUrl) {
                try {
                    const audioBlob = await fetch(mediaUrl).then(r => r.blob());
                    const formData = new FormData();
                    formData.append("file", audioBlob, "audio.ogg");
                    formData.append("model", "whisper-1");
                    const transRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                        method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }, body: formData
                    });
                    const transData = await transRes.json();
                    audioText = transData.text;
                } catch (err: any) { console.error(`[HAUS] Transcription failed: ${err.message}`); }
            }
        }

        const msgText = audioText || msg.text || msg.content?.text || msg.caption || (typeof msg === 'string' ? msg : "");
        if (!msgText) return new Response("no text", { status: 200 });

        // Save User Message
        await supabase.from('chat_history').insert({ lead_id: lead.id, chat_id: chatId, role: 'user', content: msgText });

        // 5. AI Completion
        const { data: history } = await supabase.from('chat_history').select('role, content').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(6);
        const { data: appts } = await supabase.from('appointments').select('*').eq('lead_id', lead.id).eq('status', 'confirmed').order('appointment_date', { ascending: true });
        const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const SYSTEM_PROMPT = `Você é o "Haus", Consultor Elite da spHAUS Space. Tone: Executivo, Curto, Premium. Leads: ${JSON.stringify(lead)}. Agendamentos: ${JSON.stringify(appts)}. Agora: ${nowBR}.`;
        const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(history || []).slice().reverse()];

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-4o", messages, temperature: 0.1 })
        });
        const aiData = await aiRes.json();
        const finalReply = aiData?.choices?.[0]?.message?.content || "";

        // 6. Send Response
        if (finalReply) {
            const reqBody = { number: remoteJid, text: finalReply, readmessages: config.autoRead === true };
            const res = await fetch(`${UAZ_BASE}/send/text`, {
                method: "POST", headers: { "token": UAZ_KEY, "Content-Type": "application/json" }, body: JSON.stringify(reqBody)
            });

            if (!res.ok) {
                const errText = await res.text();
                await supabase.from('chat_history').insert({ lead_id: lead.id, chat_id: chatId, role: 'assistant', content: `[SYSTEM DEBUG] Uazapi Error: ${errText}` });
            }

            await supabase.from('chat_history').insert({ lead_id: lead.id, chat_id: chatId, role: 'assistant', content: finalReply });
        }

        return new Response("ok");

    } catch (e: any) {
        const crashMsg = `[CRITICAL ERROR] ${e.message}\nStack: ${e.stack}`;
        console.error(crashMsg);
        try {
            await supabase.from('chat_history').insert({ role: 'assistant', content: crashMsg, lead_id: DEBUG_LEAD });
        } catch (logErr) { }
        return new Response(e.message, { status: 200 });
    }
});
