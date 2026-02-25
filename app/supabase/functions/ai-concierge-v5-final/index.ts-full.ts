
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decryptMedia } from './decrypt_media.ts';

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        if (req.method === 'GET') {
            return new Response("OK", { status: 200 });
        }
        let rawBody = "";
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            rawBody = await req.text();
        }

        if (!rawBody) return new Response("Empty body", { status: 200 });

        const payload = JSON.parse(rawBody);
        const logToDb = async (level: string, message: string, meta: any = {}) => {
            try {
                await supabase.from('logs').insert({ level, message, meta, service: 'ai-concierge-v5' });
            } catch (e) { console.error("[HAUS] LogToDb failed", e); }
        };

        const instanceId = payload.instance || payload.instanceId || payload.instanceName || payload.name;
        const msg = payload.message || payload.data || payload.body || payload;

        await logToDb('info', 'Webhook Received', { instanceId, event: payload.event || payload.type, payload: rawBody.substring(0, 2000) });

        const remoteJid = msg.chatid || msg.sender_pn || msg.from || msg.remoteJid || msg.key?.remoteJid || "";
        let cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        if (cleanPhone.includes("@lid") || cleanPhone.length < 8) {
            const fallback = payload?.chat?.wa_chatid || payload?.chat?.phone || "";
            cleanPhone = fallback.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
        }

        if (!remoteJid || remoteJid.includes("status@broadcast") || !instanceId) {
            return new Response("ignored", { status: 200 });
        }

        let { data: instData } = await supabase.from('whatsapp_instances').select('settings, apikey, user_id, phone_number').eq('instance_name', instanceId).maybeSingle();

        const isGroup = remoteJid.includes("@g.us");
        const isFromMe = msg.fromMe === true || payload.fromMe === true || msg.key?.fromMe === true;

        if (isFromMe) {
            return new Response("ignored me", { status: 200 });
        }

        const { data: dbConfigs } = await supabase.from('app_config').select('key, value');
        const configMap = Object.fromEntries(dbConfigs?.map((c: any) => [c.key, c.value]) || []);

        let UAZ_KEY = instData?.apikey || configMap['UAZAPI_INSTANCE_TOKEN'];
        const UAZ_BASE = (Deno.env.get('UAZAPI_URL') || configMap['UAZAPI_BASE_URL'])?.replace(/\/$/, "");

        if (!UAZ_KEY) {
            const UAZ_ADMIN = Deno.env.get('UAZAPI_ADMIN_TOKEN') || configMap['UAZAPI_ADMIN_TOKEN'];
            if (UAZ_ADMIN) {
                try {
                    const listRes = await fetch(`${UAZ_BASE}/instance/all`, { headers: { "admintoken": UAZ_ADMIN } });
                    const list = await listRes.json();
                    const instances = Array.isArray(list) ? list : (list.instances || []);
                    const found = instances.find((i: any) => i.name === instanceId || i.instanceName === instanceId);
                    if (found?.token) {
                        UAZ_KEY = found.token;
                        await supabase.from('whatsapp_instances').upsert({
                            instance_name: instanceId, apikey: UAZ_KEY, updated_at: new Date().toISOString()
                        }, { onConflict: 'instance_name' });
                    }
                } catch (e: any) { }
            }
        }

        if (!UAZ_KEY) return new Response("no_key", { status: 200 });
        if (isGroup) return new Response("ignored group", { status: 200 });

        const config = instData?.settings || {};
        let allowedNumbers: string[] = [];
        if (Array.isArray(config.whitelistNumbers)) allowedNumbers = config.whitelistNumbers.map((n: any) => String(n).trim()).filter((n: string) => n.length > 0);
        if (allowedNumbers.length > 0 && !allowedNumbers.includes(cleanPhone)) {
            await logToDb('warn', 'Blocked: Unauthorized number', { cleanPhone, allowedNumbers });
            return new Response("unauthorized", { status: 200 });
        }

        // 3. Lead & Chat Session
        let { data: lead } = await supabase.from('leads').select('*').or(`phone.eq.${cleanPhone},phone.eq.${remoteJid}`).single();
        if (!lead) {
            const { data: newLead } = await supabase.from('leads').insert({ phone: remoteJid || cleanPhone, status: 'novo' }).select().single();
            lead = newLead;
        }

        let { data: chat } = await supabase.from('chats').select('id').eq('lead_id', lead.id).eq('status', 'open').limit(1).maybeSingle();
        if (!chat) {
            const { data: newChat } = await supabase.from('chats').insert({ lead_id: lead.id, status: 'open' }).select('id').single();
            chat = newChat;
        }
        const chatId = chat?.id || null;

        // 4. Input Processing (Transcription)
        let isAudio = msg.type === 'audio' || msg.type === 'ptt' || msg.mediaType === 'ptt' || msg.messageType === 'AudioMessage' || msg.mimetype?.includes('audio') || msg.content?.mimetype?.includes('audio');
        let audioText = "";
        if (isAudio) {
            let mediaUrl = msg.mediaUrl || msg.url || msg.content?.URL || msg.content?.url || payload.url || payload.mediaUrl;
            if (mediaUrl) {
                try {
                    let audioBlob: Blob | null = null;
                    if (mediaUrl.includes('.enc')) {
                        const mediaKey = msg.mediaKey || msg.content?.mediaKey;
                        const mimetype = msg.mimetype || msg.content?.mimetype || 'audio/ogg';
                        if (mediaKey) {
                            const encRes = await fetch(mediaUrl);
                            const encBuffer = await encRes.arrayBuffer();
                            const decryptedData = await decryptMedia(mediaKey, mimetype, encBuffer);
                            audioBlob = new Blob([decryptedData], { type: 'audio/ogg' });
                        }
                    }
                    if (!audioBlob) {
                        const res = await fetch(mediaUrl);
                        if (res.ok) audioBlob = await res.blob();
                    }
                    if (audioBlob) {
                        const formData = new FormData();
                        formData.append("file", audioBlob, "audio.ogg");
                        formData.append("model", "whisper-1");
                        const transRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                            method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }, body: formData
                        });
                        const transData = await transRes.json();
                        if (transData.text) audioText = transData.text;
                    }
                } catch (e) { }
            }
        }

        // 4. Input Processing
        const msgOriginal = msg.body || msg.text || msg.content?.text || msg.conversation || msg.message?.conversation || msg.caption || (typeof msg === 'string' ? msg : "");
        const msgText = audioText || msgOriginal;

        if (!msgText && !isAudio) return new Response("no content", { status: 200 });

        if (chatId) {
            await supabase.from('chat_messages').insert({ chat_id: chatId, role: 'user', content: msgText || "[Audio]" });

            const { data: history } = await supabase.from('chat_messages').select('role, content').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10);
            const { data: tours } = await supabase.from('venue_tours').select('*').eq('status', 'disponivel').gte('visit_date', new Date().toISOString().split('T')[0]).order('visit_date', { ascending: true }).limit(5);
            const { data: availability } = await supabase.from('availability').select('*').eq('is_active', true).order('day_of_week', { ascending: true });

            const SYSTEM_PROMPT = `Você é a spHAUS Concierge AI, consultor executivo de luxo. Siga o funil de 9 passos. Responda em PT-BR. Use tags [UPDATE_LEAD: {}] para salvar dados.`;
            const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(history || []).slice().reverse()];

            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "gpt-4o", messages, temperature: 0.2 })
            });
            const aiData = await aiRes.json();
            const fullContent = aiData?.choices?.[0]?.message?.content || "";
            const finalReply = fullContent.replace(/\[[A-Z_]+(?::.*?)?\]/gi, "").trim();

            if (finalReply) {
                await supabase.from('chat_messages').insert({ chat_id: chatId, role: 'assistant', content: finalReply });
                await fetch(`${UAZ_BASE}/send/text`, {
                    method: "POST", headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({ number: cleanPhone, text: finalReply })
                });
            }
        }
        return new Response("ok");
    } catch (e: any) {
        return new Response(e.message, { status: 200 });
    }
});
