import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    // 1. Setup Client inside handler to prevent top-level initialization errors
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch config from DB for consistency
    const { data: configRows } = await supabase.from('app_config').select('key, value');
    const config = Object.fromEntries(configRows?.map(r => [r.key, r.value]) || []);

    const UAZAPI_KEY = config['UAZAPI_INSTANCE_TOKEN'] || config['UAZAPI_KEY'];
    const UAZAPI_BASE_URL = config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com';
    const INSTANCE_NAME = config['UAZAPI_INSTANCE_NAME'] || 'sphaus';

    // --- New Settings ---
    const WHITELIST_ENABLED = config['WHITELIST_ENABLED'] === 'true';
    const WHITELIST_NUMBERS = JSON.parse(config['WHITELIST_NUMBERS'] || '[]');
    const HUMAN_HANDOVER_NUMBER = config['HUMAN_HANDOVER_NUMBER'] || '5514991117987';

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const UAZAPI_ENDPOINT = `${UAZAPI_BASE_URL}/message/sendText/${INSTANCE_NAME}`;

    const SYSTEM_PROMPT = `
Você é o Concierge spHAUS, um assistente virtual de elite especializado em atendimento imobiliário e concierge de luxo. 
[Tom: Elegante, Empático, Ultra-Profissional]

REGRAS: 
- Se o cliente pedir para falar com atendente/humano, ou se a dúvida for muito complexa, use a tag [HANDOVER].
- Classifique a temperatura do lead com [STATUS_QUENTE] ou [STATUS_MORNO].
`;

    try {
        if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

        const payload = await req.json();
        const bodyContent = payload.body || payload; // Handle different wrapper levels

        // Extraction with Group detection
        const remoteJid = bodyContent.key?.remoteJid || bodyContent.from || bodyContent.sender;
        const isGroup = remoteJid?.endsWith('@g.us') || bodyContent.isGroup === true || bodyContent.key?.participant != null;
        const sender = remoteJid?.split('@')[0];
        const text = bodyContent.message?.conversation || bodyContent.text?.body || bodyContent.text;
        const pushName = bodyContent.pushName || 'Convidado';

        if (!sender || !text) {
            console.error('Invalid Payload received:', JSON.stringify(payload));
            return new Response('Missing sender or text', { status: 400 });
        }

        // --- Universal Group Guard ---
        if (isGroup) {
            console.log(`[AI-Concierge] Group Blocking: Detected message from group ${remoteJid}. Ignoring.`);
            return new Response(JSON.stringify({ success: true, status: 'ignored_group_message' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`[AI-Concierge] Private Message from ${sender}: ${text}`);

        // --- Conditional Whitelist Guard ---
        // Only block if Whitelist is ENABLED AND has numbers. 
        // If disabled or empty, allow all (Universal access for leads).
        if (WHITELIST_ENABLED && WHITELIST_NUMBERS.length > 0) {
            if (!WHITELIST_NUMBERS.includes(sender)) {
                console.log(`[AI-Concierge] Whitelist Blocking: ${sender} is not in allowed list.`);
                return new Response(JSON.stringify({ success: true, status: 'ignored_by_whitelist' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            console.log(`[AI-Concierge] Whitelist Allowed: ${sender} is authorized.`);
        } else {
            console.log(`[AI-Concierge] Whitelist Inactive/Empty: Flowing for all Private Messages.`);
        }

        if (!UAZAPI_KEY) {
            console.error('CRITICAL: UAZAPI_KEY is not configured in Supabase Secrets.');
        }

        // --- Core Logic ---

        // Find Lead
        let { data: lead } = await supabase.from('leads').select('*').eq('phone', sender).single();
        if (!lead) {
            const { data: newLead } = await supabase.from('leads').insert({ phone: sender, name: pushName, status: 'new' }).select().single();
            lead = newLead;
        }

        // History
        await supabase.from('chat_history').insert({ lead_id: lead.id, role: 'user', content: text });
        const { data: history } = await supabase.from('chat_history').select('role, content').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(10);

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history?.reverse().map((m: any) => ({ role: m.role, content: m.content })) || []
        ];

        // AI Call
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.7 })
        });

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices[0].message.content;

        let cleanContent = rawContent.replace(/\[STATUS_QUENTE\]|\[STATUS_MORNO\]|\[HANDOVER\]/g, '').trim();
        const isHandover = rawContent.includes('[HANDOVER]');

        // Update Lead Status
        if (rawContent.includes('[STATUS_QUENTE]')) await supabase.from('leads').update({ status: 'hot' }).eq('id', lead.id);
        if (rawContent.includes('[STATUS_MORNO]')) await supabase.from('leads').update({ status: 'warm' }).eq('id', lead.id);
        if (isHandover) await supabase.from('leads').update({ status: 'human_needed' }).eq('id', lead.id);

        if (isHandover) {
            console.log(`[AI-Concierge] Handover triggered for ${sender}`);
            // Send Vcard or Text with contact
            const handoverMsg = `Com certeza! Estou transferindo seu atendimento para nosso especialista. \n\nVocê também pode chamar diretamente aqui: https://wa.me/${HUMAN_HANDOVER_NUMBER}`;
            cleanContent = handoverMsg; // Override AI response with standard handover message? Or append? 
            // Let's perform the override to be safe and consistent.
        }

        // Store AI Reply
        await supabase.from('chat_history').insert({ lead_id: lead.id, role: 'assistant', content: cleanContent });

        // Send to Uazapi
        const uazapiPayload = { number: sender, text: cleanContent };
        console.log(`[AI-Concierge] Sending to Uazapi: ${UAZAPI_ENDPOINT}`);

        const uazapiRes = await fetch(UAZAPI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': UAZAPI_KEY || '' },
            body: JSON.stringify(uazapiPayload)
        });

        const logText = await uazapiRes.text();
        console.log(`[AI-Concierge] Uazapi result: ${uazapiRes.status} - ${logText}`);

        return new Response(JSON.stringify({ success: true, ai_response: cleanContent }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error('Edge Function Internal Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
