import { createClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * AI-CONCIERGE-V2 — Multi-tenant AI Agent
 *
 * Receives pre-routed requests from webhook-router.
 * Dynamically loads agent config, funnel step, chat history, and RAG context.
 * Responds via Uazapi.
 */
Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    try {
        const {
            tenant_id,
            agent_id,
            phone,
            message,
            push_name,
            instance_name,
            apikey,
            remote_jid,
        } = await req.json();

        if (!tenant_id || !agent_id || !phone || !message) {
            return new Response("missing_params", { status: 400 });
        }

        // ─── 1. LOAD AGENT CONFIG ────────────────────────────
        const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agent_id)
            .eq('tenant_id', tenant_id)
            .single();

        if (!agent || !agent.is_active) {
            return new Response("agent_inactive", { status: 200 });
        }

        // ─── 2. LOAD OR CREATE LEAD ──────────────────────────
        let { data: lead } = await supabase
            .from('leads')
            .select('*')
            .eq('phone', phone)
            .eq('tenant_id', tenant_id)
            .single();

        if (!lead) {
            const { data: newLead } = await supabase.from('leads').insert({
                phone,
                tenant_id,
                agent_id,
                name: push_name || null,
                status: 'frio',
                pipeline_stage: 'new',
                metadata: { push_name, source: 'whatsapp', instance: instance_name },
            }).select().single();
            lead = newLead;
        }

        if (!lead) return new Response("lead_error", { status: 500 });

        // Update last_interaction
        await supabase.from('leads').update({
            last_interaction: new Date().toISOString(),
            ...(push_name && !lead.name ? { name: push_name } : {}),
        }).eq('id', lead.id);

        // ─── 3. LOAD CHAT HISTORY ────────────────────────────
        const { data: history } = await supabase
            .from('chat_history')
            .select('role, content')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(20);

        // Save incoming message
        await supabase.from('chat_history').insert({
            tenant_id,
            lead_id: lead.id,
            role: 'user',
            content: message,
        });

        // ─── 4. LOAD FUNNEL STEP ─────────────────────────────
        let funnelContext = "";
        if (lead.current_funnel_step) {
            const { data: step } = await supabase
                .from('funnel_steps')
                .select('*')
                .eq('id', lead.current_funnel_step)
                .single();
            if (step) {
                funnelContext = `\n[ETAPA DO FUNIL: ${step.name}]\nInstruções: ${step.prompt_instructions || 'Siga o fluxo natural.'}`;
            }
        } else {
            // Load first funnel step for this agent
            const { data: firstStep } = await supabase
                .from('funnel_steps')
                .select('*')
                .eq('agent_id', agent_id)
                .eq('is_active', true)
                .order('step_order', { ascending: true })
                .limit(1)
                .single();
            if (firstStep) {
                funnelContext = `\n[ETAPA DO FUNIL: ${firstStep.name}]\nInstruções: ${firstStep.prompt_instructions || 'Siga o fluxo natural.'}`;
                await supabase.from('leads').update({ current_funnel_step: firstStep.id }).eq('id', lead.id);
            }
        }

        // ─── 5. RAG CONTEXT (if pgvector available) ──────────
        let ragContext = "";
        try {
            const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "text-embedding-3-small", input: message }),
            });
            const embeddingData = await embeddingRes.json();
            const queryVector = embeddingData.data?.[0]?.embedding;

            if (queryVector) {
                const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
                    query_embedding: queryVector,
                    match_tenant_id: tenant_id,
                    match_count: 5,
                });
                if (chunks && chunks.length > 0) {
                    ragContext = "\n[BASE DE CONHECIMENTO]\n" + chunks.map((c: any) => c.content).join("\n---\n");
                }
            }
        } catch (ragErr) {
            console.log("[ai-concierge-v2] RAG not available, skipping:", ragErr);
        }

        // ─── 6. LOAD APPOINTMENTS ────────────────────────────
        const { data: appointments } = await supabase
            .from('appointments')
            .select('*')
            .eq('lead_id', lead.id)
            .eq('status', 'confirmed')
            .order('appointment_date', { ascending: true });

        // ─── 7. BUILD DYNAMIC SYSTEM PROMPT ──────────────────
        const nowBR = new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

        const SYSTEM_PROMPT = `${agent.system_prompt}

[CONTEXTO DO LEAD]
Nome: ${lead.name || 'Desconhecido'}
Telefone: ${lead.phone}
Status: ${lead.status}
Etapa do Pipeline: ${lead.pipeline_stage || 'new'}
Dados coletados: ${JSON.stringify(lead.metadata || {})}
${funnelContext}
${ragContext}

[AGENDAMENTOS ATIVOS]
${appointments && appointments.length > 0 ? JSON.stringify(appointments) : 'Nenhum agendamento'}

[DATA/HORA ATUAL]
${nowBR} (Fuso: America/Sao_Paulo)

[REGRAS GERAIS]
- Responda de forma humanizada, como no WhatsApp (mensagens curtas e diretas)
- Use o nome do lead de forma natural e intermitente
- Siga as instruções da etapa atual do funil
- NUNCA diga "não tenho acesso à agenda" — você TEM acesso total
- Se precisar atualizar dados do lead, use a tool update_lead
- Se precisar agendar, use a tool schedule_appointment
- Se precisar avançar no funil, use a tool advance_funnel`;

        // ─── 8. DEFINE TOOLS ─────────────────────────────────
        const tools = [
            {
                type: "function",
                function: {
                    name: "schedule_appointment",
                    description: "Agenda um compromisso/reunião para o lead.",
                    parameters: {
                        type: "object",
                        properties: {
                            datetime: { type: "string", description: "Data/hora ISO 8601" },
                            summary: { type: "string", description: "Descrição do agendamento" },
                        },
                        required: ["datetime"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "cancel_appointment",
                    description: "Cancela um agendamento existente.",
                    parameters: {
                        type: "object",
                        properties: {
                            appointment_id: { type: "string", description: "ID do agendamento" },
                        },
                        required: ["appointment_id"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "update_lead",
                    description: "Atualiza dados do lead (nome, empresa, email, budget, etc).",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            company: { type: "string" },
                            email: { type: "string" },
                            budget_range: { type: "string", enum: ["A", "B", "C", "D"] },
                            notes: { type: "string" },
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "advance_funnel",
                    description: "Move o lead para a próxima etapa do funil de atendimento.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Motivo do avanço" },
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "handover_human",
                    description: "Transfere o atendimento para um humano.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Motivo da transferência" },
                        },
                        required: ["reason"],
                    },
                },
            },
        ];

        // ─── 9. CALL OPENAI ──────────────────────────────────
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(history || []).slice().reverse().map((m: any) => ({ role: m.role, content: m.content })),
            { role: 'user', content: message },
        ];

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: agent.model || "gpt-4o-mini",
                messages,
                tools,
                tool_choice: "auto",
                temperature: Number(agent.temperature) || 0.7,
                max_tokens: 500,
            }),
        });

        const aiData = await aiRes.json();
        const choice = aiData.choices?.[0];
        let finalReply = choice?.message?.content || "";
        const toolCalls = choice?.message?.tool_calls;

        // ─── 10. PROCESS TOOL CALLS ──────────────────────────
        if (toolCalls) {
            for (const call of toolCalls) {
                const args = JSON.parse(call.function.arguments);

                if (call.function.name === 'schedule_appointment') {
                    await supabase.from('appointments').insert({
                        tenant_id,
                        lead_id: lead.id,
                        appointment_date: args.datetime,
                        notes: args.summary || '',
                        status: 'confirmed',
                    });
                    await supabase.from('leads').update({ pipeline_stage: 'scheduled' }).eq('id', lead.id);
                    console.log(`[ai-concierge-v2] Scheduled: ${args.datetime}`);
                }

                if (call.function.name === 'cancel_appointment') {
                    await supabase.from('appointments')
                        .update({ status: 'cancelled' })
                        .eq('id', args.appointment_id);
                    console.log(`[ai-concierge-v2] Cancelled: ${args.appointment_id}`);
                }

                if (call.function.name === 'update_lead') {
                    const updates: Record<string, any> = {};
                    if (args.name) updates.name = args.name;
                    if (args.company || args.email || args.budget_range || args.notes) {
                        updates.metadata = {
                            ...lead.metadata,
                            ...(args.company ? { company: args.company } : {}),
                            ...(args.email ? { email: args.email } : {}),
                            ...(args.budget_range ? { budget_range: args.budget_range } : {}),
                            ...(args.notes ? { notes: args.notes } : {}),
                        };
                    }
                    if (args.budget_range) {
                        updates.status = ['A', 'B', 'C'].includes(args.budget_range) ? 'quente' : 'morno';
                    }
                    await supabase.from('leads').update(updates).eq('id', lead.id);
                    console.log(`[ai-concierge-v2] Lead updated:`, updates);
                }

                if (call.function.name === 'advance_funnel') {
                    const { data: currentStep } = await supabase
                        .from('funnel_steps')
                        .select('step_order')
                        .eq('id', lead.current_funnel_step)
                        .single();

                    if (currentStep) {
                        const { data: nextStep } = await supabase
                            .from('funnel_steps')
                            .select('id, name')
                            .eq('agent_id', agent_id)
                            .eq('is_active', true)
                            .gt('step_order', currentStep.step_order)
                            .order('step_order', { ascending: true })
                            .limit(1)
                            .single();

                        if (nextStep) {
                            await supabase.from('leads').update({ current_funnel_step: nextStep.id }).eq('id', lead.id);
                            console.log(`[ai-concierge-v2] Funnel advanced to: ${nextStep.name}`);
                        }
                    }
                }

                if (call.function.name === 'handover_human') {
                    await supabase.from('leads').update({ pipeline_stage: 'human_handover' }).eq('id', lead.id);
                    console.log(`[ai-concierge-v2] Handover: ${args.reason}`);
                }
            }

            // If tool calls but no text reply, generate follow-up
            if (!finalReply) {
                finalReply = "Entendido! Processei sua solicitação. ✅";
            }
        }

        // ─── 11. SEND RESPONSE VIA UAZAPI ────────────────────
        const UAZ_BASE = (Deno.env.get('UAZAPI_BASE_URL') || 'https://backstagefy.uazapi.com').replace(/\/$/, "");
        const UAZ_KEY = apikey || Deno.env.get('UAZAPI_DEFAULT_KEY') || "";

        if (finalReply && UAZ_KEY) {
            // Simulate typing
            await fetch(`${UAZ_BASE}/chat/presence/${instance_name}`, {
                method: 'POST',
                headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: phone, status: 'composing' }),
            }).catch(() => { });

            await new Promise(r => setTimeout(r, Math.min(finalReply.length * 30, 3000)));

            // Send message
            await fetch(`${UAZ_BASE}/message/text/${instance_name}`, {
                method: 'POST',
                headers: { 'token': UAZ_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    text: finalReply,
                }),
            });
        }

        // ─── 12. SAVE ASSISTANT REPLY ────────────────────────
        if (finalReply) {
            await supabase.from('chat_history').insert({
                tenant_id,
                lead_id: lead.id,
                role: 'assistant',
                content: finalReply,
            });
        }

        console.log(`[ai-concierge-v2] ✅ ${phone} → ${finalReply.substring(0, 80)}...`);
        return new Response("processed", { status: 200 });

    } catch (err) {
        console.error("[ai-concierge-v2] Error:", err);
        return new Response("error", { status: 500 });
    }
});
