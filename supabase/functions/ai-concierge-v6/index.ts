import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        // ===== STEP 0: Parse Webhook Payload =====
        const payload = await req.json();
        console.log('[V6] Incoming:', JSON.stringify(payload).substring(0, 500));

        const msg = payload.message || payload.data || payload.body || payload;
        const remoteJid = msg.key?.remoteJid || msg.sender || msg.chatid || msg.remoteJid || payload.remoteJid || '';

        if (!remoteJid || remoteJid.includes('status@broadcast')) {
            return new Response('ignored', { status: 200 });
        }

        const cleanPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isGroup = remoteJid.includes('@g.us');
        const instanceName = payload.instance_key || payload.instanceName || payload.name || 'backstagefy';

        // ===== STEP 1: Load Config & Guards =====
        const { data: configs } = await supabase.from('app_config').select('key, value');
        const config = Object.fromEntries(configs?.map((r: any) => [r.key, r.value]) || []);

        if (isGroup && config['IGNORE_GROUPS'] === 'true') {
            return new Response('ignored_group', { status: 200 });
        }
        if (config['WHITELIST_ENABLED'] === 'true') {
            const allowed = JSON.parse(config['WHITELIST_NUMBERS'] || '[]');
            if (allowed.length > 0 && !allowed.includes(cleanPhone)) {
                return new Response('unauthorized', { status: 200 });
            }
        }
        const isCall = payload.type === 'call' || msg.type === 'call' || !!payload.call;
        if (isCall && config['REJECT_CALLS'] === 'true') {
            return new Response('call_ignored', { status: 200 });
        }

        // Blacklist guard
        const blacklist = JSON.parse(config['BLACKLIST_NUMBERS'] || '[]');
        if (blacklist.includes(cleanPhone)) {
            console.log(`[V6] Blacklisted: ${cleanPhone}`);
            return new Response('blacklisted', { status: 200 });
        }

        // ===== STEP 2: Resolve Agent from Instance =====
        let agent: any = null;
        const { data: waInstance } = await supabase
            .from('whatsapp_instances')
            .select('agent_id, tenant_id, apikey')
            .eq('instance_name', instanceName)
            .single();

        if (waInstance?.agent_id) {
            const { data: agentData } = await supabase
                .from('agents')
                .select('*')
                .eq('id', waInstance.agent_id)
                .single();
            agent = agentData;
        }

        // Fallback: get first active agent for any tenant
        if (!agent) {
            const { data: fallbackAgent } = await supabase
                .from('agents')
                .select('*')
                .eq('is_active', true)
                .eq('channel', 'whatsapp')
                .limit(1)
                .single();
            agent = fallbackAgent;
        }

        // Ultimate fallback defaults
        const agentName = agent?.name || 'Assistente';
        const agentPrompt = agent?.system_prompt || 'Você é um assistente de atendimento profissional e amigável.';
        const agentModel = agent?.model || 'gpt-4o-mini';
        const agentTemp = parseFloat(agent?.temperature) || 0.7;
        const tenantId = waInstance?.tenant_id || agent?.tenant_id || null;

        console.log(`[V6] Agent: ${agentName} | Model: ${agentModel} | Tenant: ${tenantId}`);

        // ===== STEP 3: Identify/Create Lead =====
        let { data: lead } = await supabase.from('leads').select('*').eq('phone', cleanPhone).single();

        if (!lead) {
            // Get first funnel step (greeting)
            const { data: firstStep } = await supabase
                .from('funnel_steps')
                .select('id')
                .eq('step_order', 1)
                .eq('type', 'greeting')
                .eq('is_active', true)
                .limit(1)
                .single();

            const { data: newLead, error: createError } = await supabase.from('leads').insert({
                phone: cleanPhone,
                pipeline_stage: 'new',
                status: 'frio',
                tenant_id: tenantId,
                agent_id: agent?.id,
                current_funnel_step: firstStep?.id || null
            }).select().single();

            if (createError) throw createError;
            lead = newLead;
            console.log(`[V6] New lead captured: ${lead.id}`);
        }

        // Extract message text
        const msgText = msg.text || msg.message?.conversation || msg.content?.text || msg.caption || '';
        if (!msgText) {
            console.log('[V6] No text in message');
            return new Response('no_text', { status: 200 });
        }

        // Save user message
        await supabase.from('chat_history').insert({ lead_id: lead.id, role: 'user', content: msgText, tenant_id: tenantId });

        // Update last_interaction
        await supabase.from('leads').update({ last_interaction: new Date().toISOString() }).eq('id', lead.id);

        // ===== STEP 4: Resolve Current Funnel Step =====
        let currentStep: any = null;
        if (lead.current_funnel_step) {
            const { data: stepData } = await supabase
                .from('funnel_steps')
                .select('*')
                .eq('id', lead.current_funnel_step)
                .single();
            currentStep = stepData;
        }

        // Fallback: if no step assigned, get greeting step
        if (!currentStep) {
            const { data: greetingStep } = await supabase
                .from('funnel_steps')
                .select('*')
                .eq('step_order', 1)
                .eq('type', 'greeting')
                .eq('is_active', true)
                .limit(1)
                .single();
            currentStep = greetingStep;
            if (currentStep) {
                await supabase.from('leads').update({ current_funnel_step: currentStep.id }).eq('id', lead.id);
            }
        }

        console.log(`[V6] Funnel Step: ${currentStep?.name || 'NONE'} (${currentStep?.type || 'unknown'})`);

        // ===== STEP 5: RAG - Knowledge Base Query =====
        let ragContext = '';
        try {
            // Generate embedding for user message
            const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'text-embedding-3-small', input: msgText })
            });
            const embeddingData = await embeddingRes.json();
            const embedding = embeddingData?.data?.[0]?.embedding;

            if (embedding && tenantId) {
                const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
                    query_embedding: embedding,
                    match_tenant_id: tenantId,
                    match_count: 3
                });

                if (chunks && chunks.length > 0) {
                    const relevantChunks = chunks.filter((c: any) => c.similarity > 0.3);
                    if (relevantChunks.length > 0) {
                        ragContext = relevantChunks.map((c: any) => c.content).join('\n\n---\n\n');
                        console.log(`[V6] RAG: Found ${relevantChunks.length} relevant chunks (similarity > 0.3)`);
                    }
                }
            }
        } catch (ragErr: any) {
            console.error('[V6] RAG Error (non-fatal):', ragErr.message);
        }

        // ===== STEP 6: Load Context =====
        const { data: history } = await supabase
            .from('chat_history')
            .select('role, content')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(20);

        const { data: appts } = await supabase
            .from('appointments')
            .select('*')
            .eq('lead_id', lead.id)
            .eq('status', 'confirmed')
            .order('appointment_date', { ascending: true });

        // Get all funnel steps for advancement
        const { data: allSteps } = await supabase
            .from('funnel_steps')
            .select('id, step_order, name, type')
            .eq('is_active', true)
            .order('step_order', { ascending: true });

        const nowBR = new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // ===== STEP 7: Build Dynamic System Prompt =====
        const stepsMap = allSteps?.map(s => `${s.step_order}. ${s.name} (${s.type})`).join('\n') || 'Nenhuma etapa definida';

        const SYSTEM_PROMPT = `
${agentPrompt}

Você se chama "${agentName}". Responda sempre em português brasileiro.

═══════════════════════════════════════
[ETAPA ATUAL DO FUNIL: ${currentStep?.name || 'Não definida'}]
Tipo: ${currentStep?.type || 'desconhecido'}
Ordem: ${currentStep?.step_order || '?'} de ${allSteps?.length || '?'}

${currentStep?.prompt_instructions || 'Nenhuma instrução específica para esta etapa.'}
═══════════════════════════════════════

[MAPA DO FUNIL COMPLETO]
${stepsMap}
→ Etapa atual: ${currentStep?.step_order || '?'}. ${currentStep?.name || '?'}
→ Use advance_funnel_step quando os critérios de avanço forem atendidos.

${ragContext ? `═══════════════════════════════════════
[BASE DE CONHECIMENTO - Informações Verificadas]
${ragContext}
═══════════════════════════════════════
⚠️ Use estas informações para responder. Não invente dados.` : ''}

[DADOS DO LEAD]
- ID: ${lead.id}
- Nome: ${lead.name || 'Ainda não informado'}
- Telefone: ${lead.phone}
- Status: ${lead.status}
- Etapa Atual: ${currentStep?.name || 'Não definida'}
- Pipeline: ${lead.pipeline_stage}
- Metadata: ${JSON.stringify(lead.metadata || {})}

[CONTEXTO TEMPORAL]
- Data/Hora Atual: ${nowBR}
- Agendamentos Ativos: ${appts?.length ? JSON.stringify(appts) : 'Nenhum'}

[REGRAS GLOBAIS DE COMPORTAMENTO]
1. SEJA NATURAL — Responda como um ser humano no WhatsApp, não como um robô.
2. Use o nome do lead intercaladamente (não em toda mensagem).
3. Mensagens curtas e diretas (estilo WhatsApp).
4. NUNCA invente informações. Se não souber, consulte a base ou diga que vai verificar.
5. Quando coletar informações do lead (nome, email, empresa), use update_lead imediatamente.
6. Avance de etapa SOMENTE quando os critérios forem genuinamente atendidos.
7. Se o lead pedir para falar com humano, use handover_to_human.
8. Se o lead parecer desinteressado ou pedir tempo, crie um follow-up.
9. Consulte a base de conhecimento quando o lead perguntar sobre produtos, serviços ou informações da empresa.
10. 🚨 INSTRUÇÃO CRÍTICA SOBRE AGENDA: Você TEM ACESSO TOTAL à agenda. NUNCA diga "não tenho acesso".
`;

        // ===== STEP 8: Define Tools =====
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'advance_funnel_step',
                    description: 'Avança o lead para a próxima etapa do funil quando os critérios de avanço da etapa atual forem atendidos.',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Motivo pelo qual o lead está sendo avançado' }
                        },
                        required: ['reason']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'update_lead',
                    description: 'Atualiza informações de qualificação do lead quando ele revelar dados pessoais ou de negócio.',
                    parameters: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Nome do lead' },
                            company_name: { type: 'string' },
                            corporate_email: { type: 'string' },
                            budget_range: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                            event_format: { type: 'string' },
                            status: { type: 'string', enum: ['frio', 'morno', 'quente'], description: 'Temperatura do lead baseado no interesse' }
                        }
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'schedule_appointment',
                    description: 'Agenda um compromisso/visita/reunião para o lead.',
                    parameters: {
                        type: 'object',
                        properties: {
                            datetime: { type: 'string', description: 'Data/hora no formato YYYY-MM-DD HH:mm' },
                            summary: { type: 'string', description: 'Resumo do compromisso' }
                        },
                        required: ['datetime']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'cancel_appointment',
                    description: 'Cancela um agendamento existente.',
                    parameters: {
                        type: 'object',
                        properties: { id: { type: 'string', description: 'ID do agendamento' } },
                        required: ['id']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'search_knowledge',
                    description: 'Busca informações na base de conhecimento da empresa. Use quando o lead perguntar sobre produtos, serviços, preços, ou informações da empresa.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Pergunta ou tema para buscar na base' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'handover_to_human',
                    description: 'Transfere a conversa para um atendente humano quando o lead solicitar ou quando a situação exigir intervenção humana.',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Motivo da transferência' }
                        },
                        required: ['reason']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'create_follow_up',
                    description: 'Agenda um follow-up para reengajar o lead depois. Use quando o lead pedir tempo para pensar ou quando demonstrar interesse mas não converter.',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Motivo do follow-up' }
                        },
                        required: ['reason']
                    }
                }
            }
        ];

        // ===== STEP 9: Call LLM =====
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(history || []).slice().reverse()
        ];

        console.log(`[V6] Calling ${agentModel} with ${messages.length} messages, ${tools.length} tools`);

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: agentModel,
                messages,
                tools,
                tool_choice: 'auto',
                temperature: agentTemp
            })
        });

        const aiData = await aiRes.json();
        if (aiData.error) {
            console.error('[V6] OpenAI Error:', aiData.error);
            throw new Error(`OpenAI: ${aiData.error.message}`);
        }

        const responseMessage = aiData?.choices?.[0]?.message;
        const toolCalls = responseMessage?.tool_calls;
        let finalReply = responseMessage?.content || '';

        // ===== STEP 10: Execute Tool Calls =====
        const executed: string[] = [];
        let UAZ_KEY = waInstance?.apikey || config['UAZAPI_INSTANCE_TOKEN'] || config['UAZAPI_KEY'];
        const UAZ_BASE = (config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, '');

        if (toolCalls) {
            for (const call of toolCalls) {
                const args = JSON.parse(call.function.arguments);
                const fn = call.function.name;
                console.log(`[V6] Tool: ${fn}`, args);

                // --- advance_funnel_step ---
                if (fn === 'advance_funnel_step') {
                    if (currentStep && allSteps) {
                        const nextStep = allSteps.find((s: any) => s.step_order === currentStep.step_order + 1);
                        if (nextStep) {
                            await supabase.from('leads').update({ current_funnel_step: nextStep.id }).eq('id', lead.id);
                            executed.push(`ADVANCED:${currentStep.name}->${nextStep.name}`);
                            console.log(`[V6] Funnel advanced: ${currentStep.name} → ${nextStep.name} | Reason: ${args.reason}`);
                        } else {
                            executed.push('FUNNEL_END');
                            console.log('[V6] Already at last funnel step');
                        }
                    }
                }

                // --- update_lead ---
                if (fn === 'update_lead') {
                    const updates: any = {};
                    if (args.name) updates.name = args.name;
                    if (args.company_name || args.corporate_email || args.budget_range || args.event_format) {
                        updates.metadata = { ...(lead.metadata || {}), ...args };
                    }
                    if (args.status) updates.status = args.status;
                    if (Object.keys(updates).length > 0) {
                        await supabase.from('leads').update(updates).eq('id', lead.id);
                        executed.push(`UPDATED_LEAD:${Object.keys(updates).join(',')}`);
                    }
                }

                // --- schedule_appointment ---
                if (fn === 'schedule_appointment') {
                    const dt = args.datetime.includes('-03:00') ? args.datetime : `${args.datetime} -03:00`;
                    await supabase.from('appointments').insert({
                        lead_id: lead.id,
                        tenant_id: tenantId,
                        appointment_date: new Date(dt).toISOString(),
                        status: 'confirmed',
                        notes: args.summary
                    });
                    executed.push('SCHEDULED');
                    await notifyAdmin(config, `🚀 **Novo Agendamento**\nLead: ${lead.name || cleanPhone}\nData: ${args.datetime}\nResumo: ${args.summary || 'N/A'}`, UAZ_BASE, UAZ_KEY);
                }

                // --- cancel_appointment ---
                if (fn === 'cancel_appointment') {
                    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);
                    executed.push(`CANCELLED:${args.id}`);
                    await notifyAdmin(config, `🗑️ **Agendamento Cancelado**\nLead: ${lead.name || cleanPhone}\nID: ${args.id}`, UAZ_BASE, UAZ_KEY);
                }

                // --- search_knowledge ---
                if (fn === 'search_knowledge') {
                    try {
                        const searchEmbRes = await fetch('https://api.openai.com/v1/embeddings', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ model: 'text-embedding-3-small', input: args.query })
                        });
                        const searchEmbData = await searchEmbRes.json();
                        const searchEmb = searchEmbData?.data?.[0]?.embedding;

                        if (searchEmb && tenantId) {
                            const { data: searchResults } = await supabase.rpc('match_knowledge_chunks', {
                                query_embedding: searchEmb,
                                match_tenant_id: tenantId,
                                match_count: 5
                            });
                            if (searchResults && searchResults.length > 0) {
                                const context = searchResults.map((r: any) => r.content).join('\n---\n');
                                finalReply = '';
                                executed.push(`SEARCH_KB:${args.query}`);
                                // Re-call LLM with search results
                                const followUpMessages = [
                                    ...messages,
                                    responseMessage,
                                    { role: 'tool', tool_call_id: call.id, content: `Resultados da base de conhecimento:\n${context}` }
                                ];
                                const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ model: agentModel, messages: followUpMessages, temperature: agentTemp })
                                });
                                const followUpData = await followUpRes.json();
                                finalReply = followUpData?.choices?.[0]?.message?.content || 'Encontrei as informações, mas tive dificuldade em formular a resposta.';
                            }
                        }
                    } catch (searchErr: any) {
                        console.error('[V6] search_knowledge error:', searchErr.message);
                    }
                }

                // --- handover_to_human ---
                if (fn === 'handover_to_human') {
                    const adminNumber = config['HUMAN_HANDOVER_NUMBER'];
                    if (adminNumber) {
                        await notifyAdmin(config, `🚨 **Transferência para Humano**\nLead: ${lead.name || cleanPhone}\nTelefone: ${lead.phone}\nMotivo: ${args.reason}\n\nResponda diretamente ao lead.`, UAZ_BASE, UAZ_KEY);
                    }
                    executed.push(`HANDOVER:${args.reason}`);
                    await supabase.from('leads').update({ pipeline_stage: 'handover' }).eq('id', lead.id);
                }

                // --- create_follow_up ---
                if (fn === 'create_follow_up') {
                    await supabase.from('follow_up_logs').insert({
                        lead_id: lead.id,
                        agent_id: agent?.id,
                        tenant_id: tenantId,
                        status: 'active',
                        attempt_count: 0
                    });
                    executed.push(`FOLLOW_UP:${args.reason}`);
                }
            }

            if (!finalReply) finalReply = 'Entendido. Processei sua solicitação.';
        }

        // ===== STEP 11: Send Reply via Uazapi =====
        if (finalReply) {
            // Presence simulation: typing
            try {
                await fetch(`${UAZ_BASE}/send/presence`, {
                    method: 'POST',
                    headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: remoteJid, presence: 'composing' })
                });
                const typingDelay = Math.min(finalReply.length * 50, 3000);
                await new Promise(r => setTimeout(r, typingDelay));
            } catch (_e) { /* presence is optional */ }

            await fetch(`${UAZ_BASE}/send/text`, {
                method: 'POST',
                headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
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
                tenant_id: tenantId
            });
        }

        // ===== STEP 12: Debug Log =====
        await supabase.from('debug_logs').insert({
            step: 'v6_executed',
            data: {
                agent: agentName,
                model: agentModel,
                funnel_step: currentStep?.name,
                rag_used: !!ragContext,
                tools_executed: executed,
                reply_length: finalReply?.length || 0
            }
        });

        return new Response('ok', { status: 200 });

    } catch (e: any) {
        console.error('[V6] Fatal Error:', e.message, e.stack);
        await supabase.from('debug_logs').insert({ step: 'v6_error', data: { error: e.message } }).catch(() => { });
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
