import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        console.log('[REMINDER] Starting appointment reminder check...');

        // Current time in BRT (UTC-3)
        const now = new Date();
        const nowBRT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const currentHour = nowBRT.getHours();

        // Only send reminders during business hours (8 AM - 10 PM BRT)
        if (currentHour < 8 || currentHour >= 22) {
            console.log(`[REMINDER] Outside business hours (${currentHour}h BRT). Skipping.`);
            return new Response('outside_hours', { status: 200, headers: corsHeaders });
        }

        // Window: appointments happening in the next 60 minutes that haven't been reminded
        const windowStart = now.toISOString();
        const windowEnd = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

        const { data: appointments, error: fetchErr } = await supabase
            .from('appointments')
            .select('*, leads!inner(id, name, phone, tenant_id, agent_id)')
            .in('status', ['scheduled', 'confirmed'])
            .eq('reminder_sent', false)
            .gte('appointment_date', windowStart)
            .lte('appointment_date', windowEnd)
            .order('appointment_date', { ascending: true });

        if (fetchErr) {
            console.error('[REMINDER] Fetch error:', fetchErr.message);
            return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders });
        }

        if (!appointments || appointments.length === 0) {
            console.log('[REMINDER] No upcoming appointments needing reminders.');
            return new Response('no_reminders', { status: 200, headers: corsHeaders });
        }

        console.log(`[REMINDER] Found ${appointments.length} appointments to remind.`);

        // Load Uazapi config from app_config
        const { data: configs } = await supabase.from('app_config').select('key, value');
        const config = Object.fromEntries(configs?.map((r: any) => [r.key, r.value]) || []);

        const UAZ_BASE = (config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com').replace(/\/$/, '');

        let sentCount = 0;

        for (const appt of appointments) {
            try {
                const lead = appt.leads;
                if (!lead?.phone) {
                    console.log(`[REMINDER] Skipping appt ${appt.id} - no phone`);
                    continue;
                }

                // Get Uazapi key from whatsapp_instances or app_config
                let uazKey = config['UAZAPI_INSTANCE_TOKEN'] || config['UAZAPI_KEY'];
                if (lead.tenant_id) {
                    const { data: waInstance } = await supabase
                        .from('whatsapp_instances')
                        .select('apikey')
                        .eq('tenant_id', lead.tenant_id)
                        .limit(1)
                        .single();
                    if (waInstance?.apikey) uazKey = waInstance.apikey;
                }

                if (!uazKey) {
                    console.log(`[REMINDER] No Uazapi key found for tenant ${lead.tenant_id}`);
                    continue;
                }

                // Format appointment time
                const apptDate = new Date(appt.appointment_date);
                const timeStr = apptDate.toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Get agent name for greeting
                let agentName = 'Assistente';
                if (lead.agent_id) {
                    const { data: agentData } = await supabase
                        .from('agents')
                        .select('name')
                        .eq('id', lead.agent_id)
                        .single();
                    if (agentData?.name) agentName = agentData.name;
                }

                const appointmentType = appt.appointment_type === 'online' ? 'reunião online' :
                    appt.appointment_type === 'presencial' ? 'visita presencial' : 'compromisso';

                const leadName = lead.name || 'amigo(a)';

                // Build reminder message
                const reminderMsg = `Olá ${leadName}! 😊\n\n` +
                    `Passando para lembrar que temos ${appointmentType === 'reunião online' ? 'uma' : 'um'} *${appointmentType}* agendad${appointmentType === 'reunião online' ? 'a' : 'o'} para *${timeStr}* (daqui a pouco).\n\n` +
                    (appt.appointment_type === 'online'
                        ? `O link será enviado no horário. Fique atento(a)! 💻\n\n`
                        : `Estaremos te esperando! 🤝\n\n`) +
                    `Se precisar reagendar, é só me avisar!\n\n` +
                    `— ${agentName}`;

                // Send presence (composing)
                try {
                    await fetch(`${UAZ_BASE}/send/presence`, {
                        method: 'POST',
                        headers: { 'token': uazKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: `${lead.phone}@s.whatsapp.net`, presence: 'composing' })
                    });
                    await new Promise(r => setTimeout(r, 2000));
                } catch (_e) { /* presence is optional */ }

                // Send WhatsApp message
                const sendRes = await fetch(`${UAZ_BASE}/send/text`, {
                    method: 'POST',
                    headers: { 'token': uazKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        number: `${lead.phone}@s.whatsapp.net`,
                        text: reminderMsg
                    })
                });

                const sendOk = sendRes.ok;
                console.log(`[REMINDER] Sent to ${lead.phone}: ${sendOk ? 'OK' : 'FAIL'}`);

                // Mark appointment as reminded
                await supabase.from('appointments').update({
                    reminder_sent: true,
                    reminder_sent_at: new Date().toISOString()
                }).eq('id', appt.id);

                // Log in chat_history
                await supabase.from('chat_history').insert({
                    lead_id: lead.id,
                    role: 'assistant',
                    content: reminderMsg,
                    tenant_id: lead.tenant_id
                });

                // Log in follow_up_logs
                await supabase.from('follow_up_logs').insert({
                    lead_id: lead.id,
                    tenant_id: lead.tenant_id,
                    attempt_count: 1,
                    last_attempt_at: new Date().toISOString(),
                    logs: [{
                        type: 'appointment_reminder',
                        appointment_id: appt.id,
                        appointment_type: appt.appointment_type,
                        message: reminderMsg,
                        sent_at: new Date().toISOString(),
                        success: sendOk
                    }]
                });

                // Notify admin
                const adminNumber = config['HUMAN_HANDOVER_NUMBER'] || '5519981374216';
                await fetch(`${UAZ_BASE}/send/text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'token': uazKey },
                    body: JSON.stringify({
                        number: `${adminNumber}@s.whatsapp.net`,
                        text: `📅 *Lembrete Enviado*\nLead: ${leadName}\nTelefone: ${lead.phone}\nTipo: ${appointmentType}\nHorário: ${timeStr}`
                    })
                }).catch(() => { });

                sentCount++;

                // Small delay between messages
                await new Promise(r => setTimeout(r, 1000));

            } catch (apptErr: any) {
                console.error(`[REMINDER] Error processing appt ${appt.id}:`, apptErr.message);
            }
        }

        console.log(`[REMINDER] Done. Sent ${sentCount}/${appointments.length} reminders.`);

        return new Response(JSON.stringify({ sent: sentCount, total: appointments.length }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error('[REMINDER] Fatal:', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
});
