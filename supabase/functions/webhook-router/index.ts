import { createClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * WEBHOOK-ROUTER — Multi-tenant entry point
 * 
 * Receives webhooks from Uazapi, resolves which tenant/agent
 * should handle the message, and forwards to ai-concierge-v2.
 * 
 * Webhook URL pattern: /webhook-router?instance={instance_name}
 */
Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    try {
        const url = new URL(req.url);
        const instanceName = url.searchParams.get('instance');
        const payload = await req.json();

        // Extract message data from Uazapi webhook
        const event = payload.event;
        if (!event || !['messages.upsert'].includes(event)) {
            return new Response("ignored_event", { status: 200 });
        }

        const messageData = payload.data;
        const remoteJid = messageData?.key?.remoteJid || "";
        const fromMe = messageData?.key?.fromMe || false;
        const isGroup = remoteJid.includes("@g.us");
        const messageContent = messageData?.message?.conversation
            || messageData?.message?.extendedTextMessage?.text
            || "";

        // Ignore own messages, groups, and empty messages
        if (fromMe || isGroup || !messageContent.trim()) {
            return new Response("ignored", { status: 200 });
        }

        // Clean phone number
        const cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
        const pushName = messageData?.pushName || "";

        // 1. Resolve instance → tenant + agent
        let tenantId: string | null = null;
        let agentId: string | null = null;
        let apikey: string | null = null;

        if (instanceName) {
            const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('tenant_id, agent_id, apikey')
                .eq('instance_name', instanceName)
                .eq('status', 'connected')
                .single();

            if (instance) {
                tenantId = instance.tenant_id;
                agentId = instance.agent_id;
                apikey = instance.apikey;
            }
        }

        // Fallback: try to find by agent's whatsapp_instance field
        if (!tenantId && instanceName) {
            const { data: agent } = await supabase
                .from('agents')
                .select('id, tenant_id, whatsapp_apikey')
                .eq('whatsapp_instance', instanceName)
                .eq('is_active', true)
                .single();

            if (agent) {
                tenantId = agent.tenant_id;
                agentId = agent.id;
                apikey = agent.whatsapp_apikey;
            }
        }

        if (!tenantId || !agentId) {
            console.error(`[webhook-router] No tenant/agent found for instance: ${instanceName}`);
            return new Response("no_tenant", { status: 200 });
        }

        // 2. Check usage limits
        const { data: tenant } = await supabase
            .from('tenants')
            .select('plan, plan_status, limits, usage')
            .eq('id', tenantId)
            .single();

        if (!tenant || tenant.plan_status !== 'active') {
            console.log(`[webhook-router] Tenant ${tenantId} is not active`);
            return new Response("tenant_inactive", { status: 200 });
        }

        const messagesUsed = tenant.usage?.messages_used || 0;
        const messagesLimit = tenant.limits?.messages_month || 1000;

        if (messagesUsed >= messagesLimit) {
            console.log(`[webhook-router] Tenant ${tenantId} exceeded message limit (${messagesUsed}/${messagesLimit})`);
            return new Response("limit_exceeded", { status: 200 });
        }

        // 3. Forward to ai-concierge-v2
        const conciergePayload = {
            tenant_id: tenantId,
            agent_id: agentId,
            phone: cleanPhone,
            message: messageContent,
            push_name: pushName,
            instance_name: instanceName,
            apikey: apikey,
            remote_jid: remoteJid,
        };

        const conciergeRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-concierge-v2`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(conciergePayload),
        });

        // 4. Increment usage
        await supabase.rpc('increment_usage', {
            p_tenant_id: tenantId,
            p_field: 'messages_used',
            p_amount: 1,
        });

        const result = await conciergeRes.text();
        console.log(`[webhook-router] Processed: ${cleanPhone} → tenant:${tenantId} agent:${agentId} | ${result}`);

        return new Response(result, { status: 200 });

    } catch (err) {
        console.error("[webhook-router] Error:", err);
        return new Response("error", { status: 500 });
    }
});
