import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        const payload = await req.json();
        console.log("[V55] Incoming Payload:", JSON.stringify(payload).substring(0, 500));

        const msg = payload.message || payload.data || payload.body || payload;
        // Robust extraction for Uazapi compatibility
        const remoteJid = msg.key?.remoteJid || msg.sender || msg.chatid || msg.remoteJid || payload.remoteJid || "";

        if (!remoteJid || remoteJid.includes("status@broadcast")) {
            // Check if VIEW_STATUS is enabled to mark as read
            if (remoteJid.includes("status@broadcast")) {
                // Logic to mark as read could go here if needed
                console.log("[V55] Status broadcast detected.");
            }
            return new Response("ignored", { status: 200 });
        }

        const cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        const isGroup = remoteJid.includes("@g.us");

        // 0. Fetch config for Guards & Behaviors
        const { data: configs } = await supabase.from('app_config').select('key, value');
        const config = Object.fromEntries(configs?.map(r => [r.key, r.value]) || []);

        // --- Group Guard ---
        if (isGroup && config['IGNORE_GROUPS'] === 'true') {
            console.log(`[V55] Group message ignored: ${remoteJid}`);
            return new Response("ignored group", { status: 200 });
        }

        // --- Whitelist Guard ---
        if (config['WHITELIST_ENABLED'] === 'true') {
            const allowed = JSON.parse(config['WHITELIST_NUMBERS'] || '[]');
            if (allowed.length > 0 && !allowed.includes(cleanPhone)) {
                console.log(`[V55] Whitelist blocking: ${cleanPhone} is not authorized.`);
                return new Response("unauthorized", { status: 200 });
            }
        }

        // --- Call Rejection ---
        const isCall = payload.type === 'call' || msg.type === 'call' || !!payload.call;
        if (isCall && config['REJECT_CALLS'] === 'true') {
            console.log(`[V55] Call rejected from ${cleanPhone}`);
            // We just ignore the event, effectively "rejecting" the AI interaction
            return new Response("call_ignored", { status: 200 });
        }

        // 1. Context & Auto-Capture (V55)
        let { data: lead } = await supabase.from('leads').select('*').eq('phone', cleanPhone).single();

        if (!lead) {
            console.log("[V55] New lead detected. Capturing...");
            const { data: newLead, error: createError } = await supabase.from('leads').insert({
                phone: cleanPhone,
                pipeline_stage: 'new',
                status: 'frio'
            }).select().single();

            if (createError) throw createError;
            lead = newLead;
            await supabase.from('debug_logs').insert({ step: 'lead_captured', data: { phone: cleanPhone, lead_id: lead.id } });
        }

        const msgText = msg.text || msg.message?.conversation || msg.content?.text || msg.caption || "";
        if (!msgText) {
            console.log("[V55] No text found in message:", JSON.stringify(msg).substring(0, 200));
            return new Response("no text", { status: 200 });
        }

        await supabase.from('chat_history').insert({ lead_id: lead.id, role: 'user', content: msgText });

        const { data: history } = await supabase.from('chat_history').select('role, content').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(6);
        const { data: appts } = await supabase.from('appointments').select('*').eq('lead_id', lead.id).eq('status', 'confirmed').order('appointment_date', { ascending: true });
        // Config already fetched above

        const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        // 2. Define Tools
        const tools = [
            {
                type: "function",
                function: {
                    name: "cancel_appointment",
                    description: "Cancela um agendamento do cliente.",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "string" } },
                        required: ["id"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "schedule_appointment",
                    description: "Cria um novo agendamento.",
                    parameters: {
                        type: "object",
                        properties: {
                            datetime: { type: "string", description: "YYYY-MM-DD HH:mm" },
                            summary: { type: "string" }
                        },
                        required: ["datetime"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "send_gallery",
                    description: "Envia fotos do espaço para o cliente.",
                    parameters: {
                        type: "object",
                        properties: {
                            category: { type: "string", enum: ["space", "acer"], description: "Categoria das fotos." }
                        },
                        required: ["category"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_lead",
                    description: "Atualiza informações de qualificação do lead.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            company_name: { type: "string" },
                            corporate_email: { type: "string" },
                            budget_range: { type: "string", enum: ["A", "B", "C", "D"], description: "A(35-60k), B(60-100k), C(>100k), D(<35k)" },
                            event_format: { type: "string" }
                        }
                    }
                }
            }
        ];

        const SYSTEM_PROMPT = `
Você é o "Haus", Consultor Elite da spHAUS Space. 
Sua missão é proporcionar uma experiência premium e técnica.

[FLUXO DE QUALIFICAÇÃO]
1. Identifique o nome e empresa.
2. Ancore valor (cite a infraestrutura: LEDs 4K, Gastronomia, Som Meyer Sound).
3. Pergunte sobre o Budget (A:35-60k, B:60-100k, C:>100k, D:<35k).
4. Ofereça fotos do espaço (use send_gallery).
5. Agende a visita (use schedule_appointment).

[DADOS]
Id do Lead: ${lead.id}
Nome Atual: ${lead.name || 'Desconhecido'}
Status Atual: ${lead.status}
Telefone: ${lead.phone}
Data: ${nowBR}
Agendamentos Ativos: ${JSON.stringify(appts)}

[REGRAS]
- Se o budget for C (>100k), use update_lead. 
- Use tons executivos e curtos.
- Ao enviar fotos, diga que está enviando em seguida.
`;

        const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(history || []).slice().reverse()];

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.1 })
        });

        const aiData = await aiRes.json();
        const responseMessage = aiData?.choices?.[0]?.message;
        const toolCalls = responseMessage?.tool_calls;
        let finalReply = responseMessage?.content || "";

        // 3. Handle Tool Calls
        const executed = [];
        const instanceName = payload.instance_key || payload.instanceName || payload.name || "sphaus";
        console.log(`[V55] Message from instance: ${instanceName}`);

        // Get instance token dynamically
        const { data: instance } = await supabase.from('whatsapp_instances').select('apikey').eq('instance_name', instanceName).single();

        let UAZ_KEY = instance?.apikey || config['UAZAPI_INSTANCE_TOKEN'] || config['UAZAPI_KEY'];
        const UAZ_BASE = (config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, "");

        if (!instance && instanceName !== "sphaus") {
            console.log(`[V55] Unknown instance ${instanceName}, syncing...`);
            // Attempt to fetch and return the correct key
            const { data: retry } = await supabase.from('whatsapp_instances').select('apikey').eq('instance_name', instanceName).single();
            if (retry) UAZ_KEY = retry.apikey;
        }

        if (toolCalls) {
            for (const call of toolCalls) {
                const args = JSON.parse(call.function.arguments);
                if (call.function.name === 'cancel_appointment') {
                    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);
                    executed.push(`CANCELLED:${args.id}`);
                    await notifyAdmin(config, `🗑️ **Visita Cancelada**\nLead: ${lead.name || cleanPhone}\nID: ${args.id}`, UAZ_BASE, UAZ_KEY);
                }
                if (call.function.name === 'schedule_appointment') {
                    const dt = args.datetime.includes("-03:00") ? args.datetime : `${args.datetime} -03:00`;
                    await supabase.from('appointments').insert({ lead_id: lead.id, appointment_date: new Date(dt).toISOString(), status: 'confirmed', ai_summary: args.summary });
                    executed.push(`SCHEDULED`);
                    await notifyAdmin(config, `🚀 **Novo Agendamento**\nLead: ${lead.name || cleanPhone}\nData: ${args.datetime}`, UAZ_BASE, UAZ_KEY);
                }
                if (call.function.name === 'update_lead') {
                    const updates: any = { ...args };
                    if (args.budget_range === 'C') updates.status = 'quente';
                    else if (args.budget_range === 'B') updates.status = 'morno';
                    await supabase.from('leads').update(updates).eq('id', lead.id);
                    executed.push(`UPDATED_LEAD`);
                }
                if (call.function.name === 'send_gallery') {
                    const { data: images } = await supabase.from('gallery_images').select('url').eq('category', args.category).limit(4);
                    if (images) {
                        for (const img of images) {
                            await fetch(`${UAZ_BASE}/send/media`, {
                                method: "POST",
                                headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                                body: JSON.stringify({ number: remoteJid, url: img.url, type: 'image' })
                            });
                            await new Promise(r => setTimeout(r, 800)); // Sequential delay
                        }
                        executed.push(`SENT_GALLERY:${args.category}`);
                    }
                }
            }
            if (!finalReply) finalReply = "Entendido. Processei sua solicitação.";
        }

        // 4. Send Response
        if (finalReply) {
            await fetch(`${UAZ_BASE}/send/text`, {
                method: "POST",
                headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({
                    number: remoteJid,
                    text: finalReply,
                    readmessages: config['AUTO_READ'] === 'true'
                })
            });

            await supabase.from('chat_history').insert({
                lead_id: lead.id,
                role: 'assistant',
                content: finalReply,
                metadata: { action: executed.join(', ') }
            });
        }

        await supabase.from('debug_logs').insert({ step: 'v55_executed', data: { reply: finalReply, tools: executed } });

        return new Response("ok");

    } catch (e: any) {
        return new Response(e.message, { status: 200 });
    }

    async function notifyAdmin(config: any, text: string, uazBase: string, uazKey: string) {
        const adminNumber = config['HUMAN_HANDOVER_NUMBER'] || '5519981374216';
        await fetch(`${uazBase}/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': uazKey },
            body: JSON.stringify({ number: `${adminNumber}@s.whatsapp.net`, text })
        }).catch(() => { });
    }
});
