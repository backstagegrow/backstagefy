import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        const payload = await req.json();
        console.log("[V6-MT] Incoming:", JSON.stringify(payload).substring(0, 300));

        // --- 1. EXTRACT MESSAGE ---
        const msg = payload.message || payload.data || payload.body || payload;
        
        // Uazapi sends event.Chat with the real phone, and event.Type with the event type
        const eventData = typeof payload.event === 'object' ? payload.event : null;
        const eventType = eventData?.Type || payload.EventType || '';
        
        // Skip status events (Read, Delivered, Played, etc.) — these are NOT user messages
        const statusEvents = ['Read', 'Delivered', 'Played', 'DeliveredAll', 'ReadAll', 'Composing'];
        if (statusEvents.includes(eventType)) {
            return new Response("status_event_ignored", { status: 200 });
        }
        
        // Extract remoteJid — prefer msg.key.remoteJid, but fall back to Uazapi-specific fields
        let remoteJid = msg.key?.remoteJid || "";
        
        // If remoteJid is a LID (Linked ID) or empty, resolve real phone from Uazapi fields
        // Key field: sender_pn contains the real phone number (e.g. "5519981374216@s.whatsapp.net")
        if (!remoteJid || remoteJid.includes("@lid")) {
            const candidates = [
                payload.sender_pn,                          // Uazapi phone number field (primary)
                msg.sender_pn,                              // sender phone in msg
                payload.chat?.id,                           // chat.id 
                payload.chatid,                             // payload-level chatid
                msg.sender,                                 // sender field
                eventData?.Chat,                            // event.Chat
                msg.Chat,                                   // msg.Chat fallback
                eventData?.Sender,                          // event.Sender
                msg.chatid,                                 // msg-level chatid
                payload.remoteJid,                          // payload.remoteJid
                msg.remoteJid,                              // msg.remoteJid
            ];
            
            // First pass: find value with @s.whatsapp.net
            for (const c of candidates) {
                if (c && typeof c === 'string' && c.includes("@s.whatsapp.net")) {
                    remoteJid = c;
                    break;
                }
            }
            
            // Second pass: find any phone-like value (10-15 digits, no @lid)
            if (!remoteJid || remoteJid.includes("@lid")) {
                for (const c of candidates) {
                    if (c && typeof c === 'string' && /^\d{10,15}$/.test(c.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", ""))) {
                        if (!c.includes("@lid")) {
                            remoteJid = c.includes("@") ? c : c + "@s.whatsapp.net";
                            break;
                        }
                    }
                }
            }
        }

        if (!remoteJid || remoteJid.includes("status@broadcast")) {
            return new Response("ignored", { status: 200 });
        }

        const cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "");
        const isGroup = remoteJid.includes("@g.us");
        const fromMe = msg.key?.fromMe || msg.fromMe || msg.IsFromMe || false;
        const wasSentByApi = msg.wasSentByApi || false;

        if (fromMe || wasSentByApi) return new Response("own message", { status: 200 });

        // --- DEDUP: Skip if this message was already processed ---
        const messageId = msg.key?.id || msg.id || msg.messageId || "";
        if (messageId) {
            const { data: existing } = await supabase.from('chat_history')
                .select('id').eq('message_id', messageId).limit(1);
            if (existing?.length) {
                console.log(`[V6-MT] Dedup: message ${messageId} already processed`);
                return new Response("already processed", { status: 200 });
            }
        }

        // --- 2. RESOLVE TENANT + AGENT via whatsapp_instances ---
        const instanceName = payload.instance || payload.instanceName || payload.instance_key || payload.name;
        if (!instanceName) {
            console.log("[V6-MT] No instance. Keys:", Object.keys(payload).join(","));
            return new Response("no instance", { status: 200 });
        }

        const { data: instanceRow } = await supabase.from('whatsapp_instances')
            .select('tenant_id, agent_id, apikey')
            .eq('instance_name', instanceName)
            .single();

        if (!instanceRow?.tenant_id) {
            console.error(`[V6-MT] Unknown instance: ${instanceName}`);
            return new Response("unknown instance", { status: 200 });
        }

        const tenantId = instanceRow.tenant_id;
        const resolvedAgentId = instanceRow.agent_id;


        // --- 3. LOAD TENANT CONFIG ---
        const { data: configs } = await supabase.from('app_config').select('key, value').in('key', ['UAZAPI_KEY', 'UAZAPI_BASE_URL']);
        const globalConfig = Object.fromEntries(configs?.map((r: any) => [r.key, r.value]) || []);

        const { data: tenantData } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single();
        const config = tenantData?.settings || {};
        const tenantName = tenantData?.name || '';

        // --- Group Guard ---
        if (isGroup && config.ignoreGroups === true) return new Response("ignored group", { status: 200 });

        // --- Whitelist Guard ---
        if (config.whitelistEnabled === true) {
            const allowed = Array.isArray(config.whitelistNumbers) ? config.whitelistNumbers : [];
            if (allowed.length > 0 && !allowed.includes(cleanPhone)) {
                console.log(`[V6-MT] Whitelist blocked: ${cleanPhone} not in [${allowed.join(',')}]`);
                return new Response("unauthorized", { status: 200 });
            }
        }

        // --- Blacklist Guard ---
        const blacklist = Array.isArray(config.blacklistNumbers) ? config.blacklistNumbers : [];
        if (blacklist.length > 0 && blacklist.includes(cleanPhone)) {
            console.log(`[V6-MT] Blacklist blocked: ${cleanPhone} is in [${blacklist.join(',')}]`);
            return new Response("blacklisted", { status: 200 });
        }

        // --- 4. LOAD AGENT ---
        let agent: any = null;
        if (resolvedAgentId) {
            const { data } = await supabase.from('agents')
                .select('id, name, system_prompt, model, temperature, settings')
                .eq('id', resolvedAgentId).single();
            agent = data;
        }
        if (!agent) {
            const { data } = await supabase.from('agents')
                .select('id, name, system_prompt, model, temperature, settings')
                .eq('tenant_id', tenantId).eq('is_active', true).eq('channel', 'whatsapp')
                .limit(1).single();
            agent = data;
        }
        if (!agent) {
            console.error(`[V6-MT] No active agent for tenant ${tenantId}`);
            return new Response("no agent", { status: 200 });
        }

        const agentId = agent.id;
        const agentName = agent.name || 'Assistente';
        const agentModel = agent.model || 'gpt-4o-mini';
        const agentTemp = parseFloat(agent.temperature) || 0.7;

        // --- 5. FIND OR CREATE LEAD ---
        // Try exact match first, then without country code prefix
        let { data: lead } = await supabase.from('leads').select('*')
            .eq('tenant_id', tenantId).eq('phone', cleanPhone).single();

        if (!lead && cleanPhone.startsWith('55') && cleanPhone.length > 10) {
            // Try without country code (legacy leads may be stored without '55')
            const phoneWithoutCC = cleanPhone.slice(2);
            const { data: legacyLead } = await supabase.from('leads').select('*')
                .eq('tenant_id', tenantId).eq('phone', phoneWithoutCC).single();
            if (legacyLead) {
                lead = legacyLead;
                // Normalize the phone to include country code
                await supabase.from('leads').update({ phone: cleanPhone }).eq('id', lead.id);
                lead.phone = cleanPhone;
                console.log(`[V6-MT] Normalized lead phone: ${phoneWithoutCC} -> ${cleanPhone}`);
            }
        }

        // Load funnel steps for this agent
        const { data: funnelSteps } = await supabase.from('funnel_steps')
            .select('*').eq('agent_id', agentId).eq('is_active', true)
            .order('step_order', { ascending: true });

        const firstStep = funnelSteps?.[0] || null;

        if (!lead) {
            const { data: newLead, error: createError } = await supabase.from('leads').insert({
                tenant_id: tenantId,
                agent_id: agentId,
                phone: cleanPhone,
                pipeline_stage: 'new',
                status: 'frio',
                current_funnel_step: firstStep?.id || null,
            }).select().single();

            if (createError) throw createError;
            lead = newLead;
        } else if (!lead.agent_id || !lead.current_funnel_step) {
            // Fix existing lead missing agent_id or funnel step
            const updates: any = {};
            if (!lead.agent_id) updates.agent_id = agentId;
            if (!lead.current_funnel_step && firstStep) updates.current_funnel_step = firstStep.id;
            if (Object.keys(updates).length) {
                await supabase.from('leads').update(updates).eq('id', lead.id);
                lead = { ...lead, ...updates };
            }
        }

        // --- 6. EXTRACT MESSAGE TEXT (with audio transcription) ---
        let msgText = msg.text || msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.content?.text || msg.caption || msg.Message || "";

        let userSentAudio = false;

        // Check for audio/voice message (UazapiGO format: msg.mediaType = 'ptt' or 'audio')
        const isAudioMsg = msg.mediaType === 'ptt' || msg.mediaType === 'audio' || msg.messageType === 'AudioMessage';

        if (!msgText && isAudioMsg) {
            userSentAudio = true;
            try {
                const UAZ_BASE = (globalConfig['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, '');
                const UAZ_KEY = instanceRow.apikey || globalConfig['UAZAPI_KEY'];
                const messageId = msg.messageid || msg.id || msg.key?.id;

                console.log(`[V6-MT] Audio detected. messageId: ${messageId}, mediaType: ${msg.mediaType}`);

                if (messageId) {
                    // Step 1: Get download URL via Uazapi /message/download
                    const dlRes = await fetch(`${UAZ_BASE}/message/download`, {
                        method: 'POST',
                        headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: messageId, return_link: true, generate_mp3: true })
                    });

                    if (dlRes.ok) {
                        const dlData = await dlRes.json();
                        const fileURL = dlData.fileURL || dlData.fileUrl || dlData.url;
                        console.log(`[V6-MT] Download response: fileURL=${!!fileURL}, mimetype=${dlData.mimetype}`);

                        // Step 2: If transcription came from Uazapi, use it directly
                        if (dlData.transcription) {
                            msgText = dlData.transcription;
                            console.log(`[V6-MT] Uazapi transcription: "${msgText.substring(0, 100)}"`);
                        } else if (fileURL) {
                            // Step 3: Download the MP3 file
                            const audioRes = await fetch(fileURL);
                            if (audioRes.ok) {
                                const audioBuffer = await audioRes.arrayBuffer();
                                console.log(`[V6-MT] Audio downloaded, size: ${audioBuffer.byteLength}`);

                                // Step 4: Transcribe with OpenAI Whisper
                                if (audioBuffer.byteLength > 100) {
                                    const formData = new FormData();
                                    const mimeType = dlData.mimetype || 'audio/mpeg';
                                    const ext = mimeType.includes('ogg') ? 'ogg' : 'mp3';
                                    formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
                                    formData.append('model', 'whisper-1');
                                    formData.append('language', 'pt');

                                    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                                        body: formData
                                    });
                                    const whisperData = await whisperRes.json();
                                    msgText = whisperData.text || '';
                                    console.log(`[V6-MT] Whisper transcribed: "${msgText.substring(0, 100)}"`);
                                }
                            } else {
                                console.log(`[V6-MT] Audio file download failed: ${audioRes.status}`);
                            }
                        }
                    } else {
                        console.log(`[V6-MT] /message/download failed: ${dlRes.status}`);
                    }
                } else {
                    console.log(`[V6-MT] No messageId found. msg keys: ${Object.keys(msg).join(',')}`);
                }
            } catch (e: any) {
                console.error('[V6-MT] Audio processing error:', e.message);
            }
        }

        if (!msgText) {
            console.log("[V6-MT] No text/audio in message");
            return new Response("no text", { status: 200 });
        }

        // Save user message
        await supabase.from('chat_history').insert({
            tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
            role: 'user', content: userSentAudio ? `[🎤 Áudio] ${msgText}` : msgText,
            message_id: messageId || null
        });

        // --- 7. LOAD CURRENT FUNNEL STEP ---
        let currentStep: any = null;
        if (lead.current_funnel_step && funnelSteps?.length) {
            currentStep = funnelSteps.find((s: any) => s.id === lead.current_funnel_step);
        }
        if (!currentStep && funnelSteps?.length) {
            currentStep = funnelSteps[0];
            await supabase.from('leads').update({ current_funnel_step: currentStep.id }).eq('id', lead.id);
        }

        // --- 8. LOAD CONTEXT ---
        const { data: history } = await supabase.from('chat_history')
            .select('role, content').eq('lead_id', lead.id)
            .order('created_at', { ascending: false }).limit(10);

        const { data: appts } = await supabase.from('appointments')
            .select('id, appointment_date, status, ai_summary')
            .eq('tenant_id', tenantId).eq('lead_id', lead.id)
            .order('appointment_date', { ascending: true }).limit(5);

        // Load knowledge base chunks (RAG)
        let kbContext = "";
        try {
            const { data: chunks } = await supabase.from('knowledge_chunks')
                .select('content').eq('tenant_id', tenantId).limit(5);
            if (chunks?.length) {
                kbContext = "\n[BASE DE CONHECIMENTO]\n" + chunks.map((c: any) => c.content).join("\n---\n");
            }
        } catch (e) { /* KB optional */ }

        // Load available media from knowledge base
        let mediaContext = "";
        try {
            const { data: mediaItems } = await supabase.from('knowledge_documents')
                .select('id, title, description, storage_path, mime_type, category')
                .eq('tenant_id', tenantId)
                .in('category', ['media', 'documents'])
                .not('storage_path', 'is', null)
                .limit(20);
            if (mediaItems?.length) {
                const mediaList = mediaItems.map((m: any) => {
                    const type = m.mime_type?.startsWith('image/') ? 'imagem' : m.mime_type?.includes('pdf') ? 'documento PDF' : 'arquivo';
                    return `- [${m.id}] ${m.title} (${type})${m.description ? ': ' + m.description : ''}`;
                }).join('\n');
                mediaContext = `\n\n[MÍDIAS E DOCUMENTOS DISPONÍVEIS]\nVocê pode enviar estes arquivos usando send_media:\n${mediaList}`;
            }
        } catch (e) { /* media optional */ }

        const nowBR = new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // --- 9. BUILD COMPOSITE SYSTEM PROMPT (4 Layers) ---

        // Layer 1: Agent Identity
        const layer1 = agent.system_prompt || `Você é ${agentName}, um assistente profissional e amigável.`;

        // Layer 2: Current Funnel Step Instructions
        let layer2 = "";
        if (currentStep?.prompt_instructions) {
            const stepIndex = funnelSteps?.findIndex((s: any) => s.id === currentStep.id) ?? 0;
            const totalSteps = funnelSteps?.length ?? 1;
            layer2 = `\n\n[ETAPA ATUAL DO FUNIL: ${currentStep.name} (${stepIndex + 1}/${totalSteps})]
Tipo: ${currentStep.type || 'custom'}
${currentStep.prompt_instructions}`;
        }

        // Layer 3: Lead Context
        const layer3 = `\n\n[CONTEXTO DO LEAD]
Nome: ${lead.name || 'Desconhecido'}
Status: ${lead.status || 'novo'}
Pipeline: ${lead.pipeline_stage || 'new'}
Telefone: ${lead.phone}
Data/Hora atual: ${nowBR}
${appts?.length ? `Agendamentos:\n${appts.map((a: any) => {
    const d = new Date(a.appointment_date);
    const dataBR = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `- [ID:${a.id}] ${dataBR} | Status: ${a.status}${a.ai_summary ? ' | ' + a.ai_summary : ''}`;
}).join('\n')}` : 'Sem agendamentos'}`;

        // Layer 4: Rules & Transitions
        let transitionRules = "";
        if (funnelSteps?.length) {
            const nextStep = funnelSteps.find((s: any) => s.step_order === (currentStep?.step_order || 0) + 1);
            transitionRules = nextStep
                ? `\n- Quando o objetivo desta etapa for alcançado, use a ferramenta 'advance_step' para avançar para "${nextStep.name}".`
                : `\n- Esta é a última etapa do funil. Não há próximo passo.`;
        }

        const layer4 = `\n\n[REGRAS IMPORTANTES]
- Seu nome é ${agentName}. Sempre se apresente como ${agentName} quando perguntarem.
- Responda de forma profissional e natural, como um humano.
- REGRA CRÍTICA DE ESCOPO: Você é uma assistente EXCLUSIVA de ${tenantName || 'esta empresa'}. Você SOMENTE pode responder sobre:
  1. Os produtos, serviços e informações desta empresa (conforme sua base de conhecimento).
  2. Agendamentos, dúvidas comerciais e atendimento ao cliente relacionado a ${tenantName || 'esta empresa'}.
  3. Informações que estejam no seu contexto de conhecimento (RAG).
- Se o cliente perguntar algo FORA do escopo da empresa (cultura geral, política, esportes, ciência, história, receitas, piadas, ou qualquer assunto não relacionado), responda educadamente algo como: "Eu sou especialista em ${tenantName || 'nossos serviços'}! Sobre isso não consigo te ajudar, mas posso te ajudar com tudo sobre nossos produtos e serviços. 😊 O que gostaria de saber?"
- NUNCA responda perguntas de conhecimento geral. Sempre redirecione para os serviços da empresa.
- Use update_lead para salvar qualquer informação que o cliente compartilhar (nome, empresa, email, etc).
- Use schedule_appointment para agendar reuniões/visitas.
- Use create_follow_up quando o lead não responder ou precisar de acompanhamento.
- Use transfer_to_human para transferir para um atendente humano se solicitado.
- IMPORTANTE: Quando o cliente pedir fotos, imagens ou documentos, use a ferramenta send_media com o ID do arquivo disponível na seção [MÍDIAS E DOCUMENTOS DISPONÍVEIS]. Você PODE e DEVE enviar mídias quando relevante!
- Use send_gallery para enviar fotos de uma categoria específica.

[FORMATAÇÃO OBRIGATÓRIA PARA WHATSAPP]
- Você está respondendo via WhatsApp. SEMPRE formate suas respostas com boa legibilidade.
- Use uma linha em branco (duas quebras de linha) para separar parágrafos e ideias diferentes.
- Mantenha parágrafos curtos (2-3 frases no máximo).
- Use *negrito* para destacar informações importantes.
- Use emojis com moderação para tornar a conversa mais amigável.
- NUNCA envie um bloco único de texto longo. Sempre quebre em parágrafos separados.
- Exemplo de boa formatação:
"Olá! 😊 Que bom falar com você!

Temos várias opções que podem te interessar. Deixa eu te explicar:

*Produto A* - Descrição breve do produto.

*Produto B* - Descrição breve do produto.

Qual deles te interessa mais?"${transitionRules}`;

        const SYSTEM_PROMPT = layer1 + layer2 + layer3 + kbContext + mediaContext + layer4;

        // --- 10. DEFINE TOOLS ---
        const tools = [
            {
                type: "function",
                function: {
                    name: "update_lead",
                    description: "Atualiza informações do lead. Use sempre que o cliente compartilhar dados novos.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Nome do cliente" },
                            company_name: { type: "string", description: "Nome da empresa" },
                            corporate_email: { type: "string", description: "Email corporativo" },
                            status: { type: "string", enum: ["novo", "frio", "morno", "quente", "convertido"], description: "Temperatura do lead" },
                            event_format: { type: "string", description: "Formato do evento ou necessidade" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "schedule_appointment",
                    description: "Agenda uma reunião ou visita.",
                    parameters: {
                        type: "object",
                        properties: {
                            datetime: { type: "string", description: "Data e hora no formato YYYY-MM-DD HH:mm" },
                            summary: { type: "string", description: "Resumo do agendamento" }
                        },
                        required: ["datetime"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "cancel_appointment",
                    description: "Cancela um agendamento existente.",
                    parameters: {
                        type: "object",
                        properties: { id: { type: "string", description: "ID do agendamento" } },
                        required: ["id"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "reschedule_appointment",
                    description: "Reagenda um agendamento existente para nova data/hora. Cancela o antigo e cria um novo.",
                    parameters: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: "ID do agendamento a ser reagendado" },
                            datetime: { type: "string", description: "Nova data e hora no formato YYYY-MM-DD HH:mm" },
                            summary: { type: "string", description: "Resumo atualizado do agendamento" }
                        },
                        required: ["id", "datetime"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "advance_step",
                    description: "Avança o lead para a próxima etapa do funil de vendas. Use quando o objetivo da etapa atual foi alcançado.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "create_follow_up",
                    description: "Cria um follow-up programado para recontatar o lead.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Motivo do follow-up" }
                        },
                        required: ["reason"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "transfer_to_human",
                    description: "Transfere o atendimento para um humano.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Motivo da transferência" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "send_media",
                    description: "Envia uma imagem, documento ou arquivo específico para o cliente. Use com o ID do arquivo listado na seção [MÍDIAS E DOCUMENTOS DISPONÍVEIS]. A mídia já será enviada com legenda, NÃO precisa enviar mensagem de texto separada depois.",
                    parameters: {
                        type: "object",
                        properties: {
                            media_id: { type: "string", description: "ID do arquivo/mídia da base de conhecimento" },
                            caption: { type: "string", description: "Legenda ou texto para acompanhar o envio" }
                        },
                        required: ["media_id"]
                    }
                }
            }
        ];

        // --- 11. CALL OPENAI ---
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(history || []).slice().reverse()
        ];

        // Show "typing..." presence BEFORE calling OpenAI (takes 5-15s)
        const UAZ_KEY_EARLY = instanceRow.apikey || globalConfig['UAZAPI_KEY'];
        const UAZ_BASE_EARLY = (globalConfig['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, "");
        await fetch(`${UAZ_BASE_EARLY}/send/presence`, {
            method: 'POST',
            headers: { 'token': UAZ_KEY_EARLY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid, presence: 'composing' })
        }).catch(() => { });

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: agentModel, messages, tools, tool_choice: "auto", temperature: agentTemp })
        });

        const aiData = await aiRes.json();
        const responseMessage = aiData?.choices?.[0]?.message;
        const toolCalls = responseMessage?.tool_calls;
        let finalReply = responseMessage?.content || "";

        // --- 12. HANDLE TOOL CALLS ---
        const executed: string[] = [];
        const UAZ_KEY = instanceRow.apikey || globalConfig['UAZAPI_KEY'];
        const UAZ_BASE = (globalConfig['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, "");
        let mediaSent = false;

        if (toolCalls) {
            for (const call of toolCalls) {
                const args = JSON.parse(call.function.arguments);

                if (call.function.name === 'update_lead') {
                    await supabase.from('leads').update(args).eq('id', lead.id);
                    executed.push(`UPDATED:${Object.keys(args).join(',')}`);
                }

                if (call.function.name === 'schedule_appointment') {
                    const dt = args.datetime.includes("-03:00") ? args.datetime : `${args.datetime} -03:00`;
                    const appointmentDate = new Date(dt);

                    // Conflict detection: check ±30min window
                    const windowStart = new Date(appointmentDate.getTime() - 30 * 60000).toISOString();
                    const windowEnd = new Date(appointmentDate.getTime() + 30 * 60000).toISOString();
                    const { data: conflicts } = await supabase.from('appointments')
                        .select('id,appointment_date')
                        .eq('tenant_id', tenantId)
                        .in('status', ['confirmed', 'scheduled'])
                        .gte('appointment_date', windowStart)
                        .lte('appointment_date', windowEnd);

                    if (conflicts?.length) {
                        executed.push('CONFLICT_DETECTED');
                        console.log(`[V6-MT] Schedule conflict: ${conflicts.length} existing at ${args.datetime}`);
                    } else {
                        await supabase.from('appointments').insert({
                            tenant_id: tenantId, lead_id: lead.id,
                            appointment_date: appointmentDate.toISOString(),
                            status: 'confirmed', ai_summary: args.summary
                        });

                        // Auto-update lead pipeline + status
                        const pipelineUpdate: any = { pipeline_stage: 'attending' };
                        if (['novo', 'frio'].includes(lead.status)) pipelineUpdate.status = 'morno';
                        await supabase.from('leads').update(pipelineUpdate).eq('id', lead.id);
                        lead = { ...lead, ...pipelineUpdate };

                        executed.push('SCHEDULED');
                        await notifyAdmin(config, `🚀 **Novo Agendamento**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nData: ${args.datetime}`, UAZ_BASE, UAZ_KEY);
                    }
                }

                if (call.function.name === 'cancel_appointment') {
                    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);
                    // Check if lead has remaining active appointments
                    const { data: remaining } = await supabase.from('appointments')
                        .select('id').eq('lead_id', lead.id).eq('tenant_id', tenantId)
                        .in('status', ['confirmed', 'scheduled']);
                    if (!remaining?.length) {
                        await supabase.from('leads').update({ pipeline_stage: 'new' }).eq('id', lead.id);
                        lead = { ...lead, pipeline_stage: 'new' };
                    }
                    executed.push(`CANCELLED:${args.id}`);
                }

                if (call.function.name === 'reschedule_appointment') {
                    // Cancel old
                    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);
                    // Create new
                    const dt = args.datetime.includes("-03:00") ? args.datetime : `${args.datetime} -03:00`;
                    const appointmentDate = new Date(dt);
                    await supabase.from('appointments').insert({
                        tenant_id: tenantId, lead_id: lead.id,
                        appointment_date: appointmentDate.toISOString(),
                        status: 'confirmed', ai_summary: args.summary || 'Reagendamento'
                    });
                    executed.push(`RESCHEDULED:${args.id}`);
                    await notifyAdmin(config, `🔄 **Reagendamento**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nNova data: ${args.datetime}`, UAZ_BASE, UAZ_KEY);
                }

                if (call.function.name === 'advance_step') {
                    if (currentStep && funnelSteps?.length) {
                        const nextStep = funnelSteps.find((s: any) => s.step_order === currentStep.step_order + 1);
                        if (nextStep) {
                            await supabase.from('leads').update({ current_funnel_step: nextStep.id }).eq('id', lead.id);
                            executed.push(`ADVANCED:${currentStep.name}->${nextStep.name}`);
                            console.log(`[V6-MT] Lead ${lead.id} advanced: ${currentStep.name} -> ${nextStep.name}`);
                        }
                    }
                }

                if (call.function.name === 'create_follow_up') {
                    await supabase.from('follow_up_logs').insert({
                        tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
                        status: 'pending', attempt_count: 0, max_attempts: 3
                    });
                    executed.push('FOLLOW_UP_CREATED');
                }

                if (call.function.name === 'transfer_to_human') {
                    await notifyAdmin(config,
                        `🙋 **Transferência Solicitada**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nMotivo: ${args.reason || 'Solicitação do cliente'}`,
                        UAZ_BASE, UAZ_KEY);
                    executed.push('TRANSFERRED');
                }

                // Handle send_media (specific file from knowledge base)
                if (call.function.name === 'send_media') {
                    const { data: mediaDoc } = await supabase.from('knowledge_documents')
                        .select('storage_path, title, mime_type')
                        .eq('id', args.media_id).single();

                    if (mediaDoc?.storage_path) {
                        const { data: urlData } = supabase.storage.from('knowledge-files').getPublicUrl(mediaDoc.storage_path);
                        const mediaType = mediaDoc.mime_type?.startsWith('image/') ? 'image'
                            : mediaDoc.mime_type?.includes('pdf') ? 'document'
                                : 'document';
                        const docName = mediaDoc.mime_type?.includes('pdf') ? `${mediaDoc.title}.pdf` : undefined;

                        await fetch(`${UAZ_BASE}/send/media`, {
                            method: 'POST',
                            headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                number: remoteJid,
                                type: mediaType,
                                file: urlData.publicUrl,
                                text: args.caption || mediaDoc.title,
                                ...(docName ? { docName } : {})
                            })
                        });
                        mediaSent = true;
                        executed.push(`MEDIA_SENT:${mediaDoc.title}`);
                        console.log(`[V6-MT] Media sent: ${mediaDoc.title} (${mediaType})`);
                    } else {
                        executed.push('MEDIA_NOT_FOUND');
                    }
                }
            }

            // --- TOOL FOLLOW-UP: Second call to get natural response ---
            if (!finalReply) {
                const toolResultMessages = toolCalls.map((call: any) => ({
                    role: "tool",
                    tool_call_id: call.id,
                    content: JSON.stringify({ success: true, executed: executed })
                }));

                const followUpMessages = [
                    ...messages,
                    responseMessage,
                    ...toolResultMessages
                ];

                try {
                    const followUpRes = await fetch("https://api.openai.com/v1/chat/completions", {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ model: agentModel, messages: followUpMessages, temperature: agentTemp })
                    });
                    const followUpData = await followUpRes.json();
                    finalReply = followUpData?.choices?.[0]?.message?.content || "";
                } catch (e) {
                    console.log("[V6-MT] Follow-up call failed:", e);
                }

                if (!finalReply) finalReply = "Pronto! Como posso te ajudar mais?";
            }
        }

        // --- 13. SEND RESPONSE (text or audio) ---
        const audioSettings = agent.settings || {};
        const audioEnabled = audioSettings.audioEnabled === true;
        const audioMaxChars = audioSettings.audioMaxChars || 500;
        const ttsVoice = audioSettings.ttsVoice || 'nova';
        const replyInAudio = audioSettings.audioReplyMode === 'always' || (audioSettings.audioReplyMode === 'mirror' && userSentAudio);

        if (finalReply && mediaSent) {
            // Media was already sent with caption — skip duplicate text reply
            console.log("[V6-MT] Skipping text reply — media already sent with caption");
            finalReply = "";
        }

        if (finalReply) {
            let sentAsAudio = false;

            // Send as audio if enabled and within char limit
            if (audioEnabled && replyInAudio && finalReply.length <= audioMaxChars) {
                try {
                    // Simulate recording presence
                    await fetch(`${UAZ_BASE}/send/presence`, {
                        method: 'POST',
                        headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: remoteJid, presence: 'recording' })
                    }).catch(() => { });
                    await new Promise(r => setTimeout(r, 1500));

                    // Generate TTS via OpenAI
                    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: 'tts-1', input: finalReply, voice: ttsVoice, response_format: 'opus' })
                    });

                    if (ttsRes.ok) {
                        const ttsBuffer = await ttsRes.arrayBuffer();
                        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(ttsBuffer)));

                        // Send as PTT (voice note)
                        const sendRes = await fetch(`${UAZ_BASE}/send/media`, {
                            method: 'POST',
                            headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                number: remoteJid,
                                media: `data:audio/ogg;base64,${base64Audio}`,
                                type: 'audio',
                                PTT: true,
                                readmessages: config.autoRead === true
                            })
                        });

                        if (sendRes.ok) sentAsAudio = true;
                    }
                } catch (e: any) {
                    console.error('[V6-MT] TTS send failed:', e.message);
                }
            }

            // Fallback to text if audio failed or not enabled
            if (!sentAsAudio) {
                // --- Format reply for WhatsApp ---
                let formattedReply = finalReply
                    .replace(/\*\*(.*?)\*\*/g, '*$1*')      // Markdown bold → WhatsApp bold
                    .replace(/__(.*?)__/g, '_$1_')           // Markdown underline → WhatsApp italic
                    .replace(/```[\s\S]*?```/g, (m: string) => m.replace(/```(\w*)\n?/g, '').trim()) // Remove code fences
                    .replace(/^#{1,6}\s+/gm, '*')            // Headers → bold marker
                    .replace(/\r\n/g, '\n')                  // Normalize line endings
                    .replace(/\n{3,}/g, '\n\n')              // Max 2 consecutive newlines
                    .trim();

                // Simulate typing presence
                await fetch(`${UAZ_BASE}/send/presence`, {
                    method: 'POST',
                    headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: remoteJid, presence: 'composing' })
                }).catch(() => { });
                await new Promise(r => setTimeout(r, Math.min(formattedReply.length * 30, 3000)));

                await fetch(`${UAZ_BASE}/send/text`, {
                    method: "POST",
                    headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        number: remoteJid, text: formattedReply,
                        readmessages: config.autoRead === true
                    })
                });
            }

            await supabase.from('chat_history').insert({
                tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
                role: 'assistant', content: sentAsAudio ? `[🔊 Áudio] ${finalReply}` : finalReply
            });
        }

        // Update last_interaction
        await supabase.from('leads').update({ last_interaction: new Date().toISOString() }).eq('id', lead.id);

        try {
            await supabase.from('debug_logs').insert({
                tenant_id: tenantId, step: 'v6mt_executed',
                data: {
                    agent: agentName, model: agentModel,
                    funnel_step: currentStep?.name || 'none',
                    tools: executed, reply_length: finalReply?.length || 0
                }
            });
        } catch (e) { /* debug optional */ }

        return new Response("ok");

    } catch (e: any) {
        console.error("[V6-MT] Fatal:", e.message);

        return new Response(e.message, { status: 200 });
    }

    async function notifyAdmin(config: any, text: string, uazBase: string, uazKey: string) {
        const adminNumber = config.handoverNumber || '5519981374216';
        try {
            await fetch(`${uazBase}/send/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': uazKey },
                body: JSON.stringify({ number: `${adminNumber}@s.whatsapp.net`, text })
            });
        } catch (e) { /* admin notify optional */ }
    }
});
