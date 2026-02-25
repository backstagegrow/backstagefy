
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decryptMedia } from './decrypt_media.ts';

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const logToDb = async (level: string, message: string, meta: any = {}) => {
        try {
            await supabase.from('logs').insert({ level, message, meta, service: 'ai-concierge-v5-v3' });
        } catch (e) { console.error("[HAUS] LogToDb failed", e); }
    };

    await logToDb('info', 'Function Start V3-TEST-Active');

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        if (req.method === 'GET') {
            const url = new URL(req.url);
            if (url.searchParams.get('debug') === 'haus') {
                const limit = parseInt(url.searchParams.get('limit') || '20');
                const { data: logs } = await supabase.from('logs').select('*', { count: 'exact' }).eq('service', 'ai-concierge-v5').order('created_at', { ascending: false }).limit(limit);
                const { data: instances } = await supabase.from('whatsapp_instances').select('*');

                // Inspect schema
                const { data: tables } = await supabase.rpc('get_tables'); // Hope this exists or try direct query
                let tableList = [];
                try {
                    const { data: t } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
                    tableList = t;
                } catch (e) { }

                return new Response(JSON.stringify({ logs, instances, tableList }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
            }
            return new Response("OK", { status: 200 });
        }

        let rawBody = "";
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            rawBody = await req.text();
        }

        if (!rawBody) return new Response("Empty body", { status: 200 });
        const payload = JSON.parse(rawBody);

        const instanceId = payload.instance || payload.instanceId || payload.instanceName || payload.name;
        const msg = payload.message || payload.data || payload.body || payload;
        const chatInfo = payload.chat || {};
        const msgType = chatInfo.wa_lastMessageType || msg.type || msg.messageType || "";
        const remoteJid = msg.chatid || msg.sender_pn || msg.from || msg.remoteJid || msg.key?.remoteJid || "";
        const messageId = msg.id || msg.messageid || msg.key?.id || "";

        // --- IDEMPOTENCY CHECK ---
        if (messageId) {
            const { data: recentLogs } = await supabase.from('logs')
                .select('id')
                .eq('message', 'Webhook Received')
                .eq('level', 'info')
                .filter('meta->>messageId', 'eq', messageId)
                .gte('created_at', new Date(Date.now() - 60000).toISOString())
                .limit(1);

            if (recentLogs && recentLogs.length > 0) {
                console.log(`[HAUS] Ignored duplicate messageId: ${messageId}`);
                return new Response("duplicate ignored", { status: 200 });
            }
        }

        // Log webhook WITH full message object (truncated)
        await logToDb('info', 'Webhook Received', {
            instanceId,
            messageId,
            eventType: payload.EventType,
            msgType,
            fromMe: msg.fromMe ?? chatInfo.wa_lastMessageSender?.includes(chatInfo.owner),
        });
        // Log full message structure separately (for media debugging)
        await logToDb('debug', 'MSG-DUMP', { msg: JSON.stringify(msg).substring(0, 1500) });

        let cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        if (cleanPhone.includes("@lid") || cleanPhone.length < 8) {
            const fallback = payload?.chat?.wa_chatid || payload?.chat?.phone || "";
            cleanPhone = fallback.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
        }
        // Normalize BR numbers (remove 55 specific prefix issues if needed, but usually 55DDD... is standard)

        await logToDb('debug', 'STEP-1: Extraction', { instanceId, remoteJid, cleanPhone, hasMsg: !!msg, fromMe: msg?.fromMe, messageId });

        if (!remoteJid || remoteJid.includes("status@broadcast") || !instanceId) {
            return new Response("ignored", { status: 200 });
        }

        let { data: instData } = await supabase.from('whatsapp_instances').select('settings, apikey, user_id, phone_number').eq('instance_name', instanceId).maybeSingle();
        if (!instData) {
            await logToDb('warn', 'Instance not found', { instanceId });
            return new Response("no_instance", { status: 200 });
        }

        const isGroup = remoteJid.includes("@g.us");
        const chatOwner = chatInfo.owner || payload?.owner || "";
        const pushName = payload?.pushName || payload?.pushname || chatInfo.wa_pushName || "";
        const lastSender = chatInfo.wa_lastMessageSender || "";
        const isFromMe = msg.fromMe === true || payload.fromMe === true || msg.key?.fromMe === true || (chatOwner && lastSender.includes(chatOwner));

        const botNumber = payload?.instance?.number || payload?.owner || payload?.payload?.owner || instData?.phone_number || "";
        const cleanBotNumber = botNumber.replace(/\D/g, "");

        if (cleanBotNumber && cleanPhone === cleanBotNumber) {
            await logToDb('info', 'Ignored: Bot self-message', { instanceId, botNumber: cleanBotNumber });
            return new Response("ignored_bot", { status: 200 });
        }

        await logToDb('debug', 'STEP-2: Guards', { isFromMe, isGroup, cleanPhone, pushName, cleanBotNumber, botNumber });

        if (isFromMe) {
            await logToDb('info', 'Ignored: Sent by me', { instanceId, remoteJid });
            return new Response("ignored me", { status: 200 });
        }

        await logToDb('debug', 'STEP-3: Config Fetch');
        let configMap: any = {};
        try {
            const { data: dbConfigs, error: configErr } = await supabase.from('app_config').select('key, value');
            if (configErr) {
                await logToDb('warn', 'Config fetch failed (table might be missing)', { error: configErr });
            } else {
                configMap = Object.fromEntries(dbConfigs?.map((c: any) => [c.key, c.value]) || []);
            }
        } catch (e: any) {
            await logToDb('error', 'Exception during config fetch', { error: e.message });
        }

        let UAZ_KEY = instData?.apikey;
        const config = instData?.settings || {};
        const UAZ_BASE = (Deno.env.get('UAZAPI_URL') || configMap['UAZAPI_BASE_URL'])?.replace(/\/$/, "");

        await logToDb('debug', 'STEP-4: UAZ Auth & Lead Ident', { hasApiKey: !!UAZ_KEY, uazBase: UAZ_BASE, pushName });

        // Identify Lead
        let { data: lead, error: lookupErr } = await supabase.from('leads').select('*').eq('phone', cleanPhone).maybeSingle();
        if (lookupErr) await logToDb('error', 'Lead lookup error', { error: lookupErr, phone: cleanPhone });

        // Name Sanity Check: If pushName contains dots or symbols common in emails/usernames, treat as null
        const isValidName = (n?: string) => {
            if (!n) return false;
            if (n.includes('.') || n.includes('@') || /^\d+$/.test(n) || n.length < 2) return false;
            return true;
        };
        const sanitizedPushName = isValidName(pushName) ? pushName : null;

        if (!lead && !isFromMe) {
            await logToDb('info', 'Creating new lead...', { phone: cleanPhone, pushName, sanitizedPushName });
            const { data: newLead, error: createErr } = await supabase.from('leads').insert({
                phone: cleanPhone,
                name: sanitizedPushName,
                status: 'frio'
            }).select().single();

            if (createErr) {
                await logToDb('error', 'Lead creation failed', { error: createErr, phone: cleanPhone });
            } else {
                lead = newLead;
                await logToDb('info', 'New lead created successfully', { leadId: lead?.id });
            }
        }

        if (!lead) {
            await logToDb('warn', 'Execution stopped: No lead identified or created', { phone: cleanPhone, isFromMe });
            return new Response("no_lead", { status: 200 });
        }

        const leadName = lead.name || pushName || "Interessado";

        if (!UAZ_KEY) {
            const UAZ_ADMIN = Deno.env.get('UAZAPI_ADMIN_TOKEN') || configMap['UAZAPI_ADMIN_TOKEN'];
            if (UAZ_ADMIN) {
                try {
                    await logToDb('info', 'Searching for instance token in Uazapi...', { instanceId });
                    const listRes = await fetch(`${UAZ_BASE}/instance/all`, { headers: { "admintoken": UAZ_ADMIN } });
                    const list = await listRes.json();
                    const instances = Array.isArray(list) ? list : (list.instances || []);
                    const found = instances.find((i: any) => i.name === instanceId || i.instanceName === instanceId);

                    if (found?.token) {
                        UAZ_KEY = found.token;
                        await logToDb('info', 'New UAZ_KEY found. Enforcing Singleton and Webhook Setup.', { instanceId });

                        // 1. Singleton Enforce: Delete any other instance records to keep it clean
                        await supabase.from('whatsapp_instances').delete().neq('instance_name', instanceId);

                        // 2. Upsert Current Instance to DB
                        await supabase.from('whatsapp_instances').upsert({
                            instance_name: instanceId,
                            apikey: UAZ_KEY,
                            status: found.status || found.state || 'connected',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'instance_name' });

                        // 3. Auto-configure Webhook
                        const webhookUrl = `${SUPABASE_URL}/functions/v1/ai-concierge-v5-final`;
                        await fetch(`${UAZ_BASE}/webhook`, {
                            method: 'POST',
                            headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                url: webhookUrl,
                                enabled: true,
                                events: ['messages'],
                                excludeMessages: ['wasSentByApi', 'isGroupYes']
                            })
                        });
                        await logToDb('info', `Webhook auto-configured for ${instanceId}`);
                    }
                } catch (e: any) {
                    await logToDb('error', 'Self-healing UAZ lookup failed', { error: e.message });
                }
            }
        }

        if (!UAZ_KEY) return new Response("no_apikey", { status: 200 });
        const ignoreGroups = config.ignoreGroups === true;
        if (isGroup && ignoreGroups) return new Response("ignored group", { status: 200 });

        // --- BLACKLIST CHECK (must run before whitelist) ---
        let blacklistedNumbers: string[] = [];
        if (Array.isArray(config.blacklistNumbers)) blacklistedNumbers = config.blacklistNumbers.map((n: any) => String(n).trim().replace(/\D/g, ''));
        else if (typeof config.blacklistNumbers === 'string') blacklistedNumbers = config.blacklistNumbers.split(',').map((n: string) => n.trim().replace(/\D/g, ''));

        // Also check global config fallback
        const globalBlacklist = configMap['BLACKLIST_NUMBERS'];
        if (globalBlacklist && typeof globalBlacklist === 'string') {
            try {
                const parsed = JSON.parse(globalBlacklist);
                if (Array.isArray(parsed)) {
                    const extra = parsed.map((n: any) => String(n).trim().replace(/\D/g, ''));
                    blacklistedNumbers = [...new Set([...blacklistedNumbers, ...extra])];
                }
            } catch {
                const extra = globalBlacklist.split(',').map((n: string) => n.trim().replace(/\D/g, ''));
                blacklistedNumbers = [...new Set([...blacklistedNumbers, ...extra])];
            }
        }

        if (blacklistedNumbers.length > 0) {
            const cleanTarget = cleanPhone.replace(/\D/g, '');
            const isBlacklisted = blacklistedNumbers.some(num => cleanTarget.endsWith(num) || num.endsWith(cleanTarget));
            if (isBlacklisted) {
                await logToDb('info', 'Blocked: Blacklisted number', { cleanPhone, blacklistedNumbers });
                return new Response("blacklisted", { status: 200 });
            }
        }

        const whitelistEnabled = config.whitelistEnabled === true || configMap['WHITELIST_ENABLED'] === 'true';
        let allowedNumbers: string[] = [];

        // 1. Local Instance Numbers
        if (Array.isArray(config.whitelistNumbers)) allowedNumbers = config.whitelistNumbers.map((n: any) => String(n).trim().replace(/\D/g, ''));
        else if (typeof config.whitelistNumbers === 'string') allowedNumbers = config.whitelistNumbers.split(',').map((n: string) => n.trim().replace(/\D/g, ''));

        // 2. Global Config Numbers (fallback/additional)
        const globalWhitelist = configMap['WHITELIST_NUMBERS'] || configMap['WHITELIST_NUMBER'] || configMap['AI_ALLOWED_NUMBERS'];
        if (globalWhitelist && typeof globalWhitelist === 'string') {
            const extra = globalWhitelist.split(',').map((n: string) => n.trim().replace(/\D/g, ""));
            allowedNumbers = [...new Set([...allowedNumbers, ...extra])];
        }

        if (whitelistEnabled && allowedNumbers.length > 0) {
            const cleanTarget = cleanPhone.replace(/\D/g, '');
            const isAuthorized = allowedNumbers.some(num => cleanTarget.endsWith(num) || num.endsWith(cleanTarget));
            if (!isAuthorized) {
                await logToDb('warn', 'Blocked: Unauthorized number (Whitelist Active)', { cleanPhone, allowedNumbers });
                return new Response("unauthorized", { status: 200 });
            }
        }

        const autoRead = config.autoRead === true;
        if (autoRead) {
            fetch(`${UAZ_BASE}/chat/markread`, {
                method: "POST",
                headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ number: remoteJid, readchat: true, readmessages: true })
            }).catch(e => console.error("Proactive markread failed:", e.message));
        }

        // --- Lead & Chat Session ---
        // Ensure chatId is resolved
        let { data: chat, error: chatLookupErr } = await supabase.from('chats').select('id').eq('lead_id', lead.id).eq('status', 'open').limit(1).maybeSingle();
        if (chatLookupErr) await logToDb('error', 'Chat lookup error', { error: chatLookupErr, leadId: lead.id });

        if (!chat) {
            const { data: newChat, error: createChatErr } = await supabase.from('chats').insert({ lead_id: lead.id, status: 'open' }).select('id').single();
            if (createChatErr) {
                await logToDb('error', 'Chat creation failed', { error: createChatErr, leadId: lead.id });
            } else {
                chat = newChat;
            }
        }
        const chatId = chat?.id || null;

        // --- Input Processing (Uazapi Format) ---
        const isAudio = msgType.toLowerCase().includes('audio') || msgType.toLowerCase().includes('ptt') || msg.type === 'audio' || msg.type === 'ptt' || msg.mimetype?.includes('audio');
        const isImage = msgType.toLowerCase().includes('image') || msg.type === 'image' || msg.mimetype?.includes('image');
        let audioText = "";
        let imageDescription = "";

        await logToDb('debug', 'STEP-5: Media Detection', { msgType, isAudio, isImage, msgKeys: Object.keys(msg) });

        // --- Resolve Media URL (Uazapi: content.URL is UPPERCASE) ---
        const resolveMediaUrl = async (): Promise<string | null> => {
            // Uazapi puts media URL in content.URL (uppercase!)
            let url = msg.content?.URL || msg.content?.url || msg.mediaUrl || msg.url || msg.content?.mediaUrl || payload.url;
            if (url) {
                await logToDb('debug', 'Media URL found directly', { url: url.substring(0, 100) });
                return url;
            }

            // Fallback: Uazapi /instance/download endpoint with messageid
            const messageId = msg.messageid || msg.id || msg.key?.id || "";
            if (messageId && UAZ_KEY && UAZ_BASE) {
                try {
                    const dlRes = await fetch(`${UAZ_BASE}/instance/download`, {
                        method: 'POST',
                        headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messageid: messageId })
                    });
                    if (dlRes.ok) {
                        const dlData = await dlRes.json();
                        url = dlData.url || dlData.mediaUrl || dlData.data?.url || null;
                        if (url) {
                            await logToDb('debug', 'Media URL resolved via /instance/download', { url: url.substring(0, 100) });
                        }
                    }
                } catch (e) { }
            }
            return url || null;
        };

        if (isAudio) {
            await logToDb('info', 'Audio Detected - Starting Processing', { msgType });
            try {
                const mediaUrl = await resolveMediaUrl();
                if (mediaUrl) {
                    let audioBlob: Blob | null = null;
                    if (mediaUrl.includes('.enc')) {
                        const mediaKey = msg.mediaKey || msg.content?.mediaKey;
                        const mimetype = msg.mimetype || msg.content?.mimetype || 'audio/ogg';
                        if (mediaKey) {
                            await logToDb('debug', 'Decrypting Audio...');
                            const encRes = await fetch(mediaUrl);
                            if (!encRes.ok) throw new Error(`Fetch ENC failed: ${encRes.status}`);
                            const encBuffer = await encRes.arrayBuffer();
                            const decryptedData = await decryptMedia(mediaKey, mimetype, encBuffer);
                            audioBlob = new Blob([decryptedData], { type: 'audio/ogg' });
                        }
                    }
                    if (!audioBlob) {
                        const res = await fetch(mediaUrl);
                        if (res.ok) audioBlob = await res.blob();
                        else await logToDb('warn', `Audio Fetch failed: ${res.status}`);
                    }
                    if (audioBlob) {
                        const formData = new FormData();
                        formData.append('file', audioBlob, 'audio.ogg');
                        formData.append('model', 'whisper-1');
                        const transRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST', headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }, body: formData
                        });
                        const transData = await transRes.json();
                        audioText = transData.text || "";
                        await logToDb('info', 'Audio Transcribed', { text: audioText });
                    }
                } else {
                    await logToDb('warn', 'Audio detected but no media URL found');
                }
            } catch (e: any) {
                await logToDb('error', 'Audio Processing Error', { error: e.message });
            }
        }

        if (isImage) {
            await logToDb('info', 'Image Detected', { msgType });
            try {
                const mediaUrl = await resolveMediaUrl();
                if (mediaUrl) {
                    imageDescription = `[O usuário enviou uma imagem. URL: ${mediaUrl}]`;
                    await logToDb('info', 'Image URL resolved', { url: mediaUrl.substring(0, 100) });
                } else {
                    imageDescription = "[O usuário enviou uma imagem mas não foi possível obter a URL]";
                }
            } catch (e) {
                imageDescription = "[O usuário enviou uma imagem mas houve erro no processamento]";
            }
        }

        const msgOriginal = msg.body || msg.text || msg.content?.text || msg.conversation || "";
        const msgText = audioText || (imageDescription ? (msgOriginal ? `${imageDescription} ${msgOriginal}` : imageDescription) : msgOriginal);
        if (!msgText && !isAudio && !isImage) return new Response("no content", { status: 200 });

        const { error: msgErr } = await supabase.from('chat_history').insert({ lead_id: lead.id, chat_id: chatId, role: 'user', content: msgText || "[Audio]" });
        if (msgErr) {
            await logToDb('error', 'Message Insert Failed', { error: msgErr, leadId: lead.id, chatId });
            // Fallback: If chat_id invalid, try creating new chat? No, just log for now.
        } else {
            await logToDb('debug', 'Message Inserted', { content: msgText?.substring(0, 50) });
        }

        const { data: history } = await supabase.from('chat_history').select('role, content').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(10);
        const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        // --- Fetch appointments for this lead (both tables) ---
        const { data: appointments } = await supabase
            .from('appointments')
            .select('scheduled_at, appointment_type, status, ai_summary, location_address')
            .eq('lead_id', lead.id)
            .order('scheduled_at', { ascending: false })
            .limit(5);

        // Also check legacy venue_tours table (original scheduling table)
        // NOTE: 'notes' column does NOT exist in venue_tours — removing it prevents silent 400 error
        const { data: venueTours, error: vtError } = await supabase
            .from('venue_tours')
            .select('visit_date, visit_time, status')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(5);

        if (vtError) await logToDb('warn', 'venue_tours query error', { error: vtError.message });

        let appointmentContext = 'Nenhuma reunião ou visita agendada até o momento.';
        const allBookings: string[] = [];
        const nowTs = Date.now();

        if (appointments && appointments.length > 0) {
            for (const a of appointments) {
                const apptTs = new Date(a.scheduled_at).getTime();
                const isPast = apptTs < nowTs;
                const temporal = isPast ? '[PASSADO]' : '[FUTURO]';
                const dt = new Date(a.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const tipo = a.appointment_type === 'online' ? '🌐 Online / Call' : '🏢 Visita Presencial';
                const local = a.location_address ? ` | Local: ${a.location_address}` : '';
                allBookings.push(`• ${temporal} ${tipo} | Data: ${dt}${local}`);
            }
        }

        if (venueTours && venueTours.length > 0) {
            for (const t of venueTours) {
                // IMPORTANT: visit_time is stored in Sao Paulo time (UTC-3).
                // Append -03:00 so Deno (which runs in UTC) doesn't subtract 3h again.
                const timeStr = (t.visit_time || '00:00:00').substring(0, 5); // e.g. "10:00"
                const visitDateTimeStr = `${t.visit_date}T${t.visit_time || '00:00:00'}-03:00`;
                const visitTs = new Date(visitDateTimeStr).getTime();
                const isPast = visitTs < nowTs;
                const temporal = isPast ? '[PASSADO]' : '[FUTURO]';
                // Build readable date string directly to avoid re-conversion issues
                const dayFormatted = new Date(visitDateTimeStr).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                allBookings.push(`• ${temporal} 🏢 Visita Presencial | Data: ${dayFormatted} às ${timeStr}`);
            }
        }

        if (allBookings.length > 0) {
            appointmentContext = allBookings.join('\n');
        }

        const dynamicContext = `
        Data/Hora Atual: ${nowBR}
        CLIENTE_ATUAL:
        - Nome: ${lead.name || "NÃO IDENTIFICADO"}
        - Telefone: ${cleanPhone}
        - Empresa: ${lead.company_name || 'Não informada'}
        - Email: ${lead.corporate_email || 'Não informado'}
        - Budget: ${lead.budget_range || 'Não informado'}
        - Pipeline: ${lead.status || 'new'}

        HISTÓRICO DE REUNIÕES / VISITAS COM ESTE CLIENTE:
        ${appointmentContext}

        INSTRUÇÕES CRÍTICAS SOBRE REUNIÕES:
        1. Cada reunião está marcada como [PASSADO] ou [FUTURO] em relação ao momento atual (${nowBR}).
        2. Se [PASSADO]: Refira-se à reunião no passado. Ex: "Nossa visita foi hoje às 10h da manhã." Pergunte como foi a experiência e se pode ajudar com os próximos passos.
        3. Se [FUTURO]: Confirme os detalhes com entusiasmo. Ex: "Temos uma visita marcada para amanhã às 14h!"
        4. NUNCA diga que não há reunião se existir qualquer item listado acima.
        5. NUNCA use futuro para descrever um evento [PASSADO].
        `;

        const historyItems = (history || []).reverse().map((h: any) => ({ role: h.role, content: h.content || "" }));



        // KNOWLEDGE EXTRACTION (FROM DOCIE):
        const KNOWLEDGE_BASE = `
        [DADOS TÉCNICOS E OPERACIONAIS DA spHAUS - FONTE: MANUAL DE USO & APRESENTAÇÃO 2026]
        
        1. ARQUITETURA & DESIGN:
           - Arquiteto: Paulo Mendes da Rocha (Prêmio Pritzker 2006).
           - Localização: Av. Cidade Jardim, 924 - Jd. Europa, SP (CEP 01454-000).
           - Conceito: Galeria viva, design, cultura, arte, moda e tecnologia.
           - Fachada: Mapping e Painel de LED (exclusivo).
        
        2. ESPAÇOS E CAPACIDADES:
           - Térreo: 400m². Inclui Lounge Bar, Ilha Gourmet (Kitchens), Gazebo e Área Externa.
           - 1º Pavimento: Pé Direito Duplo. Plenária e Salas de Reunião.
           - Sala Imersiva 3D 360: Projeção mapeada total.
           
        3. INFRAESTRUTURA TÉCNICA:
           - Internet: Link Dedicado VIVO 100MB + WiFi disponível.
           - Elétrica: Predominante 110v, alguns pontos 220v.
           - Gerador: NÃO possui. Caminhão deve ficar na vaga lateral esquerda (acesso à caixa de força).
           - Acessibilidade: Elevador e acessos laterais.
        
        4. REGRAS DE USO (MUITO IMPORTANTE):
           - Cenografia: PROIBIDO furar teto, paredes, piso ou portas.
           - Efeitos: PROIBIDO fumaça, fogos de artifício, papel picado (confetes/gliter).
           - Estacionamento: Valet OBRIGATÓRIO (não incluso na locação). Vagas frente apenas para carga/descarga (15min).
           - Catering: Cozinha de apoio no Back Stage (corredor lateral esquerdo). Proibido descartar óleo em pias.
           - Horários: Respeitar rigorosamente montagem e desmontagem sob pena de multa.
        `;

        // DOMAIN PROTECTION CHECK:
        // We append these rules AT THE END of the system prompt to ensure they override any previous instructions
        // (including those potentially fetched from app_config in the database).
        const domainRules = `
        
        ################################################################################
        ### PROTOCOLO DE PROTEÇÃO DE DOMÍNIO (LEIA COM ATENÇÃO) ###
        ################################################################################
        VOCÊ ESTÁ ESTRITAMENTE PROIBIDO DE FALAR SOBRE: Futebol, Política, Religião, Clima, Receitas, Fofocas, Histórias de Pessoas Famosas ou qualquer assunto não relacionado à spHAUS ou Eventos.
        
        SE O USUÁRIO PERGUNTAR SOBRE ISSO:
        1. IGNORE o contexto da pergunta.
        2. DIGA APENAS: "Desculpe, meu foco é exclusivamente em garantir o sucesso do seu evento na spHAUS. Posso ajudar com algo sobre o espaço, orçamento ou agendamento?"
        3. NÃO responda à pergunta original. NÃO dê "curiosidades". NÃO continue o assunto.
        
        Sua única função é vender e agendar eventos na spHAUS. NÃO saia do personagem em hipótese alguma.
        
        ################################################################################
        ### PROTOCOLO CRM (CAPTURA DE DADOS) ###
        ################################################################################
        SEMPRE QUE O USUÁRIO FORNECER Nome, Empresa, E-mail ou Budget:
        1. Chame a ferramenta 'update_lead' IMEDIATAMENTE para salvar no CRM.
        2. NÃO diga apenas "está salvo", use a ferramenta para GARANTIR a persistência.
        3. Se o e-mail ou empresa não estiverem no CONTEXTO ATUAL acima, pergunte educadamente para completar o perfil.
        ################################################################################
        `;

        const messages = [
            {
                role: 'system', content: (configMap['SYSTEM_PROMPT'] || `Você é o Concierge da spHAUS. 
                SUA MISSÃO: Atuar como um consultor de alto nível para eventos corporativos e sociais.
                
                DIRETRIZES DE COMPORTAMENTO:
                1. Mantenha o foco TOTAL em assuntos da spHAUS, eventos, locação de espaço, produção e catering.
                2. SE O USUÁRIO PERGUNTAR SOBRE OUTROS ASSUNTOS (Futebol, Religião, Clima, Política, Receitas, Piadas, etc):
                   - Recuse educadamente.
                   - Diga algo como: "Desculpe, meu foco é exclusivamente em garantir o sucesso do seu evento na spHAUS. Posso ajudar com algo sobre o espaço ou orçamento?"
                   - NÃO responda a perguntas de conhecimento geral que não tenham relação direta com o evento ou a spHAUS.
                
                3. Venda o sonho: Use linguagem persuasiva e profissional.
                4. Proatividade Digital: Se o usuário pedir fotos de algo específico e você não encontrar EXATAMENTE aquela categoria, envie a categoria mais próxima (ex: "fachada" ou "entrada" estão em "ambientes"). NUNCA diga que não encontrou sem antes tentar uma alternativa ou oferecer a planta técnica (categoria "estrutura").`) + "\n\n" + KNOWLEDGE_BASE + "\n" + domainRules + "\n\nCONTEXTO ATUAL:\n" + dynamicContext
            },
            ...historyItems
        ];
        const setPresence = async (presence: 'composing' | 'recording' | 'available') => {
            const p = presence === 'available' ? 'paused' : presence;
            try {
                // Fixed endpoint: /send/presence (was /chat/presence)
                // Sending both token and apikey for maximum compatibility with Uazapi versions
                await fetch(`${UAZ_BASE}/send/presence`, {
                    method: 'POST',
                    headers: {
                        'token': UAZ_KEY,
                        'apikey': UAZ_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ number: cleanPhone, presence: p })
                });
            } catch (e) {
                await logToDb('warn', 'Presence update failed', { error: e.message });
            }
        };

        await setPresence('composing');
        // --- Tools Definition ---
        const tools = [
            {
                type: "function",
                function: {
                    name: "get_gallery",
                    description: "Busca imagens, vídeos e documentos PDF (Planta, Metragens, Manual) da spHAUS.",
                    parameters: {
                        type: "object",
                        properties: {
                            category: {
                                type: "string",
                                enum: ["fachada", "led", "ambientes", "eventos", "catering", "estrutura"],
                                description: "Categoria visual ou técnica. Use 'estrutura' para plantas, metragens e PDFs técnicos."
                            },
                            highlight: {
                                type: "boolean",
                                description: "Se true, prioriza imagens em destaque (is_featured)."
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "check_availability",
                    description: "Verifica horários disponíveis para agendamento nos próximos dias.",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "Data de interesse (YYYY-MM-DD)." }
                        },
                        required: ["date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "schedule_appointment",
                    description: "Agenda uma visita ou reunião.",
                    parameters: {
                        type: "object",
                        properties: {
                            datetime: { type: "string", description: "Data e hora ISO (YYYY-MM-DDTHH:mm:ss)." },
                            type: { type: "string", enum: ["online", "presencial"], description: "Tipo de reunião." }
                        },
                        required: ["datetime", "type"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_lead",
                    description: "Atualiza informações do lead no CRM.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            corporate_email: { type: "string", description: "Email comercial/corporativo (obrigatório para corporativos)." },
                            company_name: { type: "string", description: "Nome da empresa (obrigatório para corporativos)." },
                            budget_range: { type: "string", enum: ["A", "B", "C", "D"], description: "Faixa de investimento (A: 35k-60k, B: 60k-100k, C: >100k, D: <35k)." },
                            status: { type: "string", enum: ["frio", "qualificado", "vip", "desqualificado"], description: "Status do lead no funil." }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "request_human_handoff",
                    description: "Transfere o atendimento para um humano da equipe comercial.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Motivo da solicitação." }
                        }
                    }
                }
            }
        ];

        // --- Helper Functions ---
        const sendResilient = async (path: string, body: any) => {
            const isAutoRead = config.autoRead === true;
            if (isAutoRead && body && !body.readchat) {
                body.readchat = true;
                body.readmessages = true;
            }

            let res = await fetch(`${UAZ_BASE}${path}`, {
                method: "POST",
                headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.status === 401) {
                await logToDb('warn', 'UAZ 401 Detected. Refreshing token...');
                const UAZ_ADMIN = Deno.env.get('UAZAPI_ADMIN_TOKEN') || configMap['UAZAPI_ADMIN_TOKEN'];
                if (UAZ_ADMIN) {
                    const listRes = await fetch(`${UAZ_BASE}/instance/all`, { headers: { "admintoken": UAZ_ADMIN } });
                    const list = await listRes.json();
                    const instances = Array.isArray(list) ? list : (list.instances || []);
                    const found = instances.find((i: any) => i.name === instanceId);
                    if (found?.token) {
                        UAZ_KEY = found.token;
                        await supabase.from('whatsapp_instances').upsert({ instance_name: instanceId, apikey: UAZ_KEY }, { onConflict: 'instance_name' });
                        res = await fetch(`${UAZ_BASE}${path}`, {
                            method: "POST",
                            headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                            body: JSON.stringify(body)
                        });
                    }
                }
            }
            const data = await res.text();
            await logToDb('info', `Send to ${path} result`, { status: res.status, response: data });
            return res.ok;
        };

        const notifyCommercial = async (title: string, alert: string = "") => {
            const commercialPhone = instData?.settings?.handoverNumber || configMap['COMMERCIAL_PHONE'];
            if (!commercialPhone) {
                await logToDb('warn', 'COMMERCIAL_PHONE not configured. Notification skipped.', { title });
                return;
            }

            const statusMap: any = { 'quente': '🔥 QUENTE', 'morno': '🕒 MORNO', 'frio': '❄️ FRIO' };
            const budgetMap: any = {
                'A': '💰 R$ 2k - 5k',
                'B': '💰 R$ 5k - 10k',
                'C': '💰 R$ 10k - 20k',
                'D': '💰 + R$ 20k'
            };

            const qualification = statusMap[lead.status] || lead.status || 'Não definida';
            const budgetDesc = budgetMap[lead.budget_range] || lead.budget_range || 'Não informado';

            const template = `🚨 *${title.toUpperCase()}*

👤 *Nome:* ${lead.name || 'Não informado'}
📞 *WhatsApp:* ${cleanPhone}
🏢 *Empresa:* ${lead.company_name || 'Não informada'}
📧 *E-mail:* ${lead.corporate_email || 'Não informado'}
💰 *Budget:* ${budgetDesc}
📈 *Qualificação:* ${qualification}

🔔 *Alerta:* ${alert || 'Novo evento no fluxo.'}`;

            await sendResilient('/send/text', { number: commercialPhone, text: template });
        };

        const checkAvailability = async (dateStr: string) => {
            // Simplified logic: Check 'availability' table for the day of week
            const date = new Date(dateStr);
            const dow = date.getDay(); // 0=Sun, 1=Mon...
            const { data: slots } = await supabase.from('availability').select('start_time, end_time').eq('day_of_week', dow).eq('is_active', true);

            if (!slots || slots.length === 0) return "Não temos atendimento ou disponibilidade para este dia da semana (Sábados e Domingos costumam estar fechados). Sugira datas de Segunda a Sexta.";

            // Check existing appointments (Manual)
            const { data: manualApps } = await supabase.from('appointments')
                .select('scheduled_at')
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                .lte('scheduled_at', `${dateStr}T23:59:59`)
                .neq('status', 'cancelled');

            // Check existing venue tours (AI)
            const { data: aiTours } = await supabase.from('venue_tours')
                .select('visit_date, visit_time')
                .eq('visit_date', dateStr)
                .neq('status', 'cancelado');

            const busyTimes = [
                ...(manualApps?.map((e: any) => new Date(e.scheduled_at).toISOString().slice(11, 16)) || []),
                ...(aiTours?.map((e: any) => e.visit_time.slice(0, 5)) || [])
            ];

            return JSON.stringify({ slots, busyTimes, message: "Horários disponíveis encontrados. Verifique conflitos com busyTimes." });
        };

        const scheduleAppointment = async (datetime: string, type: string) => {
            const visitDateStr = datetime.split('T')[0];
            const visitTimeStr = datetime.split('T')[1]?.substring(0, 5) || '10:00';

            // Insert into venue_tours for legacy green styling in dashboard
            await supabase.from('venue_tours').insert({
                lead_id: lead.id,
                visit_date: visitDateStr,
                visit_time: visitTimeStr,
                status: 'reservado'
            });

            // Insert into appointments for reminder system (CRITICAL)
            const scheduledAt = new Date(`${visitDateStr}T${visitTimeStr}:00`).toISOString();

            const { data, error } = await supabase.from('appointments').insert({
                lead_id: lead.id,
                scheduled_at: scheduledAt,
                appointment_type: type.toLowerCase().includes('online') ? 'online' : 'presencial',
                location_address: type.toLowerCase().includes('presencial') ? 'Rua Leopoldo Couto de Magalhães Júnior, 755 - Itaim Bibi, São Paulo' : null,
                status: 'scheduled',
                notify_human: false
            }).select().single();

            if (error) return `Erro ao agendar: ${error.message}`;

            // --- Update Lead Pipeline Stage & Status ---
            const newStatus = lead.budget_range === 'C' ? 'quente' : 'morno';
            await supabase.from('leads').update({
                pipeline_stage: 'scheduled',
                status: newStatus
            }).eq('id', lead.id);

            let info = `Agendamento spHAUS confirmado para ${visitDateStr} às ${visitTimeStr}. Lead movido para Visita Agendada.`;

            if (type.toLowerCase().includes('presencial')) {
                info += " ENDEREÇO: Rua Leopoldo Couto de Magalhães Júnior, 755 - Itaim Bibi, São Paulo. Envie a localização para o cliente.";
            } else {
                info += " Informe que a equipe enviará o link da reunião (invite) algumas horas antes.";
            }

            await notifyCommercial("Novo Agendamento spHAUS", `Visita agendada para o dia ${visitDateStr} às ${visitTimeStr} (${type}).`);

            return info;
        };

        const updateLead = async (fields: any) => {
            // Mapping for safety (DB Constraints)
            if (fields.budget_range) {
                if (fields.budget_range.includes('A')) fields.budget_range = 'A';
                if (fields.budget_range.includes('B')) fields.budget_range = 'B';
                if (fields.budget_range.includes('C')) fields.budget_range = 'C';
                if (fields.budget_range.includes('D')) fields.budget_range = 'D';
            }
            if (fields.status) {
                if (fields.status === 'vip' || fields.status === 'qualificado') fields.status = 'quente';
                if (fields.status === 'frio_rejeitado') fields.status = 'frio';
                // DB only accepts: 'frio', 'morno', 'quente'
                if (!['frio', 'morno', 'quente'].includes(fields.status)) fields.status = 'morno';
            }

            const { data: updated, error } = await supabase.from('leads').update(fields).eq('id', lead.id).select().single();
            if (error) return `Erro ao atualizar lead: ${error.message}`;
            if (updated) lead = updated; // Sync local state for notifyCommercial
            return "Lead atualizado com sucesso no CRM.";
        };

        // --- Main AI Loop ---
        await setPresence('composing');

        // First Call
        await logToDb('debug', 'Calling OpenAI...', { model: "gpt-4o", msgCount: messages.length });
        let response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.2 })
        });

        if (!response.ok) {
            const errText = await response.text();
            await logToDb('error', 'OpenAI API Error', { status: response.status, error: errText });
            return new Response("openai_error", { status: 200 });
        }

        let aiData = await response.json();
        let aiMsg = aiData?.choices?.[0]?.message;
        await logToDb('debug', 'OpenAI First Response Received', { hasToolCalls: !!aiMsg?.tool_calls, hasContent: !!aiMsg?.content });


        // Tool Execution Loop
        if (aiMsg?.tool_calls) {
            messages.push(aiMsg); // Append AI's tool call request

            for (const tool of aiMsg.tool_calls) {
                const fnName = tool.function.name;
                const args = JSON.parse(tool.function.arguments);
                let result = "";

                await logToDb('info', `Tool Call: ${fnName}`, { args });

                if (fnName === 'check_availability') result = await checkAvailability(args.date);
                else if (fnName === 'schedule_appointment') result = await scheduleAppointment(args.datetime, args.type);
                else if (fnName === 'update_lead') result = await updateLead(args);
                else if (fnName === 'request_human_handoff') {
                    await notifyCommercial("Solicitação de Humano", args.reason || "O cliente solicitou falar com um consultor.");
                    // Update lead status to attract attention
                    await supabase.from('leads').update({ status: 'quente' }).eq('id', lead.id);
                    result = "Solicitação enviada para a equipe. Informe ao cliente que um consultor entrará em contato em breve.";
                }
                else if (fnName === 'get_gallery') {
                    const originalCategory = args.category || 'all';
                    const originalHighlight = args.highlight || false;

                    const executeQuery = async (cat: string, high: boolean) => {
                        let q = supabase.from('gallery_images').select('url, media_type, category, description, title, is_featured').limit(30);
                        if (cat && cat !== 'all') {
                            const c = cat === 'led_wall' ? 'led' : cat;
                            q = q.eq('category', c);
                        }
                        if (high) q = q.eq('is_featured', true);
                        return await q;
                    };

                    // 1. First attempt with original params
                    let { data: gallery } = await executeQuery(originalCategory, originalHighlight);

                    // 2. Fallback if Highlight returned nothing
                    if ((!gallery || gallery.length === 0) && originalHighlight) {
                        await logToDb('info', `get_gallery: No highlights for ${originalCategory}. Retrying without highlight filter.`);
                        const retry = await executeQuery(originalCategory, false);
                        gallery = retry.data;
                    }

                    // 3. Category Mapping Fallback (e.g. fachada -> ambientes)
                    if (!gallery || gallery.length === 0) {
                        const mapping: any = { 'fachada': 'ambientes', 'led': 'eventos', 'catering': 'eventos' };
                        const fallbackCat = mapping[originalCategory];
                        if (fallbackCat) {
                            await logToDb('info', `get_gallery: Category ${originalCategory} empty. Falling back to ${fallbackCat}.`);
                            const retry = await executeQuery(fallbackCat, false);
                            gallery = retry.data;
                        }
                    }

                    if (!gallery || gallery.length === 0) {
                        result = "Não encontramos arquivos nesta categoria específica no momento. Sugira ao usuário ver fotos de 'ambientes' ou solicitar a planta técnica ('estrutura').";
                    } else {
                        // Client-side shuffle to ensure variety in responses
                        const shuffled = (gallery || []).sort(() => 0.5 - Math.random()).slice(0, 10);
                        result = JSON.stringify(shuffled);
                    }
                }

                messages.push({ role: 'tool', tool_call_id: tool.id, content: result });
            }

            // Second Call (Final Response)
            response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.2 })
            });
            aiData = await response.json();
            aiMsg = aiData?.choices?.[0]?.message;
        }

        const rawContent = aiMsg?.content || "";

        // Extract Tags and Images BEFORE cleaning
        const tags = rawContent.match(/\[[A-Z_]+(?::.*?)?\]/gi) || [];
        const mdMatches = [...rawContent.matchAll(/!?\[(.*?)\]\((https?:\/\/.*?)\)/g)];

        // Clean Reply: 
        // 1. Remove ALL Markdown Links/Images (![alt](url) or [label](url))
        // 2. Remove Custom Tags ([TAG])
        // 3. Collapse newlines and empty list items
        const cleanReply = rawContent
            .replace(/!?\[.*?\]\((https?:\/\/.*?)\)/g, "") // Remove images and links
            .replace(/\[[A-Z_]+(?::.*?)?\]/gi, "") // Then remove tags
            .replace(/^\s*[\-\*\d\.]+\s*$/gm, "") // Remove lines that only have bullet points or numbers
            .replace(/\n\s*\n\s*\n+/g, "\n\n") // Collapse 3+ newlines to 2
            .trim();

        if (cleanReply) {
            await supabase.from('chat_history').insert({ lead_id: lead.id, chat_id: chatId, role: 'assistant', content: cleanReply });

            let textSent = false;

            if (!isAudio) {
                textSent = await sendResilient('/send/text', { number: cleanPhone, text: cleanReply });
            }

            // 2. Send each media found in Markdown
            // Map to track unique URLs but keep last label as caption
            const mediaToSend = new Map<string, string>();
            for (const match of mdMatches) {
                if (match[2]) mediaToSend.set(match[2].trim(), match[1] || "");
            }

            // Also check tags for SEND_IMAGE/SEND_GALLERY
            for (const tag of tags) {
                const imgMatch = tag.match(/\[(?:IMAGE|SEND_IMAGE|SEND_GALLERY)[:\s]+(https?:\/\/[^\]]+)\]/i);
                if (imgMatch) mediaToSend.set(imgMatch[1].trim(), "Imagem");
            }

            for (const [url, label] of mediaToSend.entries()) {
                const isPdf = url.toLowerCase().includes('.pdf');
                await sendResilient('/send/media', {
                    number: cleanPhone,
                    file: url,
                    type: isPdf ? 'document' : 'image',
                    caption: isPdf ? (label || 'Documento solicitado') : undefined,
                    filename: isPdf ? `${label || 'documento'}.pdf` : undefined
                });
                await new Promise(r => setTimeout(r, 500));
            }

            // 4. Handle Audio (TTS)
            if (isAudio && cleanReply.length < 500) {
                try {
                    await setPresence('recording');
                    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ model: "tts-1", input: cleanReply, voice: "onyx", response_format: "opus" })
                    });
                    const arrayBuffer = await ttsRes.arrayBuffer();
                    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                    await sendResilient('/send/media', { number: cleanPhone, file: `data:audio/ogg;base64,${audioBase64}`, type: "audio", PTT: true });
                } catch (e) {
                    if (!textSent) await sendResilient('/send/text', { number: cleanPhone, text: cleanReply });
                }
            }
        }
        await setPresence('available');

        // Process Update Tags
        for (const tag of tags) {
            if (tag.startsWith("[UPDATE_LEAD")) {
                try {
                    const jsonStr = tag.replace(/\[UPDATE_LEAD:?/i, "").replace("]", "").trim();
                    const data = JSON.parse(jsonStr);
                    await supabase.from('leads').update(data).eq('id', lead.id);
                } catch (e) { }
            }
        }

        return new Response("ok");
    } catch (e: any) {
        console.error(`[HAUS] Crash: ${e.message}`);
        try {
            await supabase.from('logs').insert({ level: 'error', message: `Global Crash: ${e.message}`, meta: { stack: e.stack }, service: 'ai-concierge-v5-v3' });
        } catch (logErr) { }
        return new Response(e.message, { status: 200 });
    }
});
