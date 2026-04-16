import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { extractMessageAndPhone } from "../_shared/webhook-parser.ts";
import { resolveTenantAndAgent, checkGuards } from "../_shared/tenant-context.ts";
import { buildKnowledgeContext } from "../_shared/rag-builder.ts";
import { callLLMWithFallback } from "../_shared/llm-orchestrator.ts";
import { executeTools, ToolExecutorContext } from "../_shared/tool-executor.ts";
import { getAvailableTools } from "../_shared/tools-list.ts";

Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? "";
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? undefined;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });

        const payload = await req.json();
        console.log("[V7] Incoming Webhook...");

        // --- 1. EXTRACT MESSAGE ---
        const parsed = extractMessageAndPhone(payload);
        if (parsed.ignore) {
            return new Response(parsed.reason, { status: 200 });
        }
        const { msg, remoteJid, cleanPhone, isGroup, messageId } = parsed;

        // --- DEDUP ---
        if (messageId) {
            const { data: existing } = await supabase.from('chat_history')
                .select('id').eq('message_id', messageId).limit(1);
            if (existing?.length) {
                console.log(`[V7] Dedup: message ${messageId} already processed`);
                return new Response("already processed", { status: 200 });
            }
        }

        // --- 2. RESOLVE TENANT + AGENT ---
        const tenantMatch = await resolveTenantAndAgent(supabase, payload);
        if (tenantMatch.error) {
            console.error(`[V7] Tenant Error: ${tenantMatch.error}`);
            return new Response(tenantMatch.error, { status: 200 });
        }
        const { tenantId, resolvedAgentId, apikey, instanceName } = tenantMatch;

        // --- 3. TENANT GUARDS ---
        const guards = await checkGuards(supabase, tenantId!, cleanPhone!, isGroup!);
        if (guards.blocked) {
            console.log(`[V7] Blocked for ${cleanPhone}: ${guards.reason}`);
            return new Response(guards.reason, { status: 200 });
        }
        const { config, tenantName } = guards;

        // UAZAPI config from Edge Function Secrets (migrated from app_config in FASE 1.2)
        const UAZ_BASE = (Deno.env.get('UAZAPI_BASE_URL') || 'https://backstagefy.uazapi.com').replace(/\/$/, "");
        const UAZ_KEY = apikey || Deno.env.get('UAZAPI_KEY') || "";

        // --- 4. LOAD ACTIVE AGENT ---
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
            console.error(`[V7] No active agent configured for tenant ${tenantId}`);
            return new Response("no agent", { status: 200 });
        }

        const agentId = agent.id;
        const agentName = agent.name || 'Assistente';
        const agentModel = agent.model || 'gpt-4o-mini';
        const agentTemp = parseFloat(agent.temperature) || 0.7;

        // --- 5. FIND OR CREATE LEAD & FUNNEL ---
        let { data: lead } = await supabase.from('leads').select('*')
            .eq('tenant_id', tenantId).eq('phone', cleanPhone).single();

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
            const updates: any = {};
            if (!lead.agent_id) updates.agent_id = agentId;
            if (!lead.current_funnel_step && firstStep) updates.current_funnel_step = firstStep.id;
            if (Object.keys(updates).length) {
                await supabase.from('leads').update(updates).eq('id', lead.id);
                lead = { ...lead, ...updates };
            }
        }

        const msgText = msg.text || msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.content?.text || msg.caption || msg.Message || "";

        if (!msgText) {
            return new Response("no text", { status: 200 });
        }

        await supabase.from('chat_history').insert({
            tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
            role: 'user', content: msgText,
            message_id: messageId || null
        });

        // --- 6. RAG BUILDER & SYSTEM PROMPT ---
        const { kbContext, mediaContext } = await buildKnowledgeContext(supabase, tenantId!);

        let currentStep: any = null;
        if (lead.current_funnel_step && funnelSteps?.length) {
            currentStep = funnelSteps.find((s: any) => s.id === lead.current_funnel_step);
        }

        const { data: history } = await supabase.from('chat_history')
            .select('role, content').eq('lead_id', lead.id)
            .order('created_at', { ascending: false }).limit(10);

        const contextStr = Object.entries(lead)
            .filter(([k, v]) => v && !['id', 'tenant_id', 'agent_id'].includes(k))
            .map(([k, v]) => `${k}: ${v}`).join(', ');

        const SYSTEM_PROMPT = `${agent.system_prompt}

[DADOS DO CLIENTE]
${contextStr}
Etapa do Funil Atual: ${currentStep?.name || 'Inicial'}
Instrução da Etapa: ${currentStep?.ai_instruction || ''}
${kbContext}
${mediaContext}

IMPORTANTE: 
NÃO formate os textos com markdown excessivo, use emojis com moderação. Responda num tom natural humano.`;

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(history || []).slice().reverse()
        ];

        const tools = getAvailableTools();

        // --- 7. LLM ORCHESTRATION ---
        const orchestratorResult = await callLLMWithFallback(
            agentModel, agentTemp, messages, tools, OPENAI_API_KEY, GEMINI_API_KEY
        );

        if (!orchestratorResult.success) {
            return new Response(`LLM Error: ${orchestratorResult.error}`, { status: 500 });
        }

        const { responseMessage, toolCalls, finalReply } = orchestratorResult;
        let aiFinalReply = finalReply;

        // --- 8. COMMAND PATTERN (TOOL EXECUTOR) ---
        let mediaSent = false;
        let toolsExecuted: string[] = [];

        if (toolCalls && toolCalls.length > 0) {
            const context: ToolExecutorContext = {
                supabase, tenantId: tenantId!, agentId, lead, agentName,
                cleanPhone: cleanPhone!, currentStep, funnelSteps: funnelSteps || [],
                config, uazBase: UAZ_BASE, uazKey: UAZ_KEY, remoteJid: remoteJid!
            };

            const toolResult = await executeTools(toolCalls, context);
            mediaSent = toolResult.mediaSent;
            toolsExecuted = toolResult.executed;

            // Follow-up interaction if assistant didn't provide a direct message along with the tool-calls
            if (!aiFinalReply) {
                const toolResultMessages = toolCalls.map((call: any) => ({
                    role: "tool",
                    tool_call_id: call.id,
                    content: JSON.stringify({ success: true, executed: toolResult.executed })
                }));

                const followUpMessages = [
                    ...messages,
                    ...(responseMessage ? [responseMessage] : []),
                    ...toolResultMessages
                ];

                const followUpResult = await callLLMWithFallback(
                    agentModel, agentTemp, followUpMessages, [], OPENAI_API_KEY, GEMINI_API_KEY
                );

                aiFinalReply = followUpResult.finalReply;
            }
        }

        if (aiFinalReply && mediaSent) {
            // Media was sent and possibly had a caption. Prevent duplicating text if needed
            // Optional: You could allow both text and media to occur depending on use-case
        }

        // --- 9. SEND RESPONSES ---
        if (aiFinalReply) {
            try {
                // Text Formatting for WhatsApp
                const formattedReply = aiFinalReply
                    .replace(/\*\*(.*?)\*\*/g, '*$1*')
                    .replace(/__(.*?)__/g, '_$1_')
                    .trim();

                const response = await fetch(`${UAZ_BASE}/send/text`, {
                    method: "POST",
                    headers: { "token": UAZ_KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        number: remoteJid, text: formattedReply,
                        readmessages: config.autoRead === true
                    })
                });

                if (!response.ok) {
                    const errTxt = await response.text();
                    console.error(`[V7] UAZAPI Error (${response.status}): ${errTxt}`);
                }

                await supabase.from('chat_history').insert({
                    tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
                    role: 'assistant', content: aiFinalReply
                });
            } catch (sendErr: any) {
                console.error(`[V7] Failed to send text via UAZAPI:`, sendErr.message);
            }
        }

        // Update interaction timestamp
        try {
            await supabase.from('leads').update({ last_interaction: new Date().toISOString() }).eq('id', lead.id);
        } catch (e: any) { console.error(`[V7] Lead Timestamp Update Failed:`, e.message); }

        try {
            await supabase.from('debug_logs').insert({
                tenant_id: tenantId, step: 'v7_executed',
                data: {
                    agent: agentName, model: agentModel,
                    funnel_step: currentStep?.name || 'none',
                    tools: toolsExecuted, reply_length: aiFinalReply?.length || 0,
                    provider: orchestratorResult.provider,
                    status: 'success'
                }
            });
        } catch (e) { /* silent fail debug logs */ }

        return new Response("ok", { status: 200 });

    } catch (e: any) {
        console.error("[V7] Fatal Route Error:", e);

        // Log fatal error to DB if possible
        try {
            const body = await req.clone().json();
            // (Minimal effort log to avoid recursion or second crash)
        } catch (e2) { }

        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
