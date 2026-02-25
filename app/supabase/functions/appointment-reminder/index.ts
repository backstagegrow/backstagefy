
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (_req) => {
    try {
        const now = new Date();
        console.log(`[REMINDER] Running at ${now.toISOString()}`);

        // Get active instance (shared instance model, no user_id filter)
        const { data: inst } = await supabase
            .from('whatsapp_instances')
            .select('apikey, instance_name, settings')
            .not('instance_name', 'is', null)
            .not('apikey', 'is', null)              // Fixed: was api_key (wrong column name)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!inst?.apikey) {
            console.log("[REMINDER] No active WhatsApp instance found.");
            return new Response("No connected instance", { status: 200 });
        }

        const UAZ_KEY = inst.apikey;
        const UAZ_BASE = Deno.env.get('UAZAPI_URL') || 'https://backstagefy.uazapi.com/api/v2';
        const HANDOVER = inst.settings?.handoverNumber || "";

        let totalSent = 0;

        // ============================================================
        // WINDOW 1: Upcoming within 70 minutes (1h + 30min reminders)
        // ============================================================
        const oneHourPlus = new Date(now.getTime() + 70 * 60000);
        const { data: apts } = await supabase
            .from('appointments')
            .select(`id, scheduled_at, appointment_type, location_address, reminder_sent_at, reminder_30min_sent, leads(id, name, phone, company_name)`)
            .eq('status', 'scheduled')
            .lte('scheduled_at', oneHourPlus.toISOString())
            .gte('scheduled_at', now.toISOString())
            .or('reminder_sent_at.is.null,reminder_30min_sent.eq.false');

        for (const apt of (apts || [])) {
            const lead = (apt as any).leads;
            if (!lead?.phone) continue;

            const scheduledDate = new Date((apt as any).scheduled_at);
            const diffMinutes = Math.round((scheduledDate.getTime() - now.getTime()) / 60000);
            const timeStr = scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            const firstName = lead.name?.split(' ')[0] || 'você';

            // 1h reminder
            if (diffMinutes >= 50 && diffMinutes <= 75 && !(apt as any).reminder_sent_at) {
                const clientMsg = `🚨 *LEMBRETE spHAUS* 🚨\n\nOlá ${firstName}! Confirmando nosso horário daqui a 1 hora — às *${timeStr}*.\n\n📍 Av. Cidade Jardim, 924 - Jd. Europa, SP\n\nNos vemos em breve! 🤝`;
                const teamMsg = `🔔 *VISITA EM 1 HORA*\n\n👤 *Cliente:* ${lead.name}\n🏢 *Empresa:* ${lead.company_name || 'N/A'}\n⏰ *Horário:* ${timeStr}\n\n⚠️ Prepare a casa!`;

                await sendWhatsApp(UAZ_BASE, UAZ_KEY, lead.phone, clientMsg);
                if (HANDOVER) await sendWhatsApp(UAZ_BASE, UAZ_KEY, HANDOVER, teamMsg);
                await supabase.from('appointments').update({ reminder_sent_at: now.toISOString() }).eq('id', apt.id);
                totalSent++;
                console.log(`[REMINDER] 1h sent to ${lead.phone}`);
            }

            // 30min reminder
            if (diffMinutes >= 15 && diffMinutes <= 40 && !(apt as any).reminder_30min_sent) {
                const clientMsg = `⏰ *Estamos prontos!* Sua visita na spHAUS começa em 30 minutos, às *${timeStr}*.\n\nAo chegar, informe ao porteiro que tem visita marcada. Valet disponível! 🏎️`;
                const teamMsg = `🚀 *ALERTA: VISITA EM 30 MIN*\n\n👤 *${lead.name}* está a caminho!\n⏰ Horário: *${timeStr}*\n\nEquipe de prontidão? ✅`;

                await sendWhatsApp(UAZ_BASE, UAZ_KEY, lead.phone, clientMsg);
                if (HANDOVER) await sendWhatsApp(UAZ_BASE, UAZ_KEY, HANDOVER, teamMsg);
                await supabase.from('appointments').update({ reminder_30min_sent: true }).eq('id', apt.id);
                totalSent++;
                console.log(`[REMINDER] 30m sent to ${lead.phone}`);
            }
        }

        // ============================================================
        // WINDOW 2: 24h before the meeting
        // ============================================================
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

        const { data: upcoming24h } = await supabase
            .from('appointments')
            .select(`id, scheduled_at, appointment_type, location_address, leads(phone, name)`)
            .gte('scheduled_at', in24h.toISOString())
            .lte('scheduled_at', in25h.toISOString())
            .eq('status', 'scheduled')
            .is('reminder_24h_sent', null);

        for (const appt of (upcoming24h || [])) {
            const lead = (appt as any).leads;
            if (!lead?.phone) continue;

            const dtBR = new Date((appt as any).scheduled_at).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            });
            const tipo = (appt as any).appointment_type === 'online' ? 'Call / Reunião Online' : 'Visita Presencial spHAUS';
            const firstName = lead.name?.split(' ')[0] || 'você';

            const msg = `Olá, ${firstName}! 👋\n\nPassando para confirmar nossa reunião de amanhã:\n\n📅 *${dtBR}*\n🏢 *${tipo}*\n\nPode confirmar sua presença? Se precisar reagendar, é só avisar! 😊`;

            await sendWhatsApp(UAZ_BASE, UAZ_KEY, lead.phone, msg);
            await supabase.from('appointments').update({ reminder_24h_sent: now.toISOString() }).eq('id', appt.id);
            totalSent++;
            console.log(`[REMINDER] 24h sent to ${lead.phone}`);
        }

        // ============================================================
        // WINDOW 3: Post-meeting follow-up (3h after)
        // ============================================================
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

        const { data: pastAppts } = await supabase
            .from('appointments')
            .select(`id, lead_id, scheduled_at, leads(phone, name)`)
            .gte('scheduled_at', fiveHoursAgo.toISOString())
            .lte('scheduled_at', threeHoursAgo.toISOString())
            .eq('status', 'scheduled')
            .is('post_meeting_sent', null);

        for (const appt of (pastAppts || [])) {
            const lead = (appt as any).leads;
            if (!lead?.phone) continue;

            const firstName = lead.name?.split(' ')[0] || 'amigo(a)';
            const msg = `${firstName}, foi um prazer conversar com você! 🏆\n\nSe quiser avançar com a proposta ou tiver dúvidas sobre o espaço, estou à disposição.\n\nPodemos dar o próximo passo? 😊`;

            await sendWhatsApp(UAZ_BASE, UAZ_KEY, lead.phone, msg);
            await supabase.from('appointments')
                .update({ status: 'completed', post_meeting_sent: now.toISOString() })
                .eq('id', appt.id);
            await supabase.from('leads')
                .update({ status: 'vip', pipeline_stage: 'post_meeting' })
                .eq('id', (appt as any).lead_id);
            totalSent++;
            console.log(`[REMINDER] Post-meeting sent to ${lead.phone}`);
        }

        console.log(`[REMINDER] Done. Total sent: ${totalSent}`);
        return new Response(JSON.stringify({ success: true, sent: totalSent }), { status: 200 });

    } catch (e: any) {
        console.error("[REMINDER] Fatal Error:", e);
        return new Response(e.message, { status: 500 });
    }
});

async function sendWhatsApp(base: string, token: string, to: string, text: string) {
    const cleanPhone = to.replace(/\D/g, "");
    try {
        const res = await fetch(`${base}/send/text`, {
            method: 'POST',
            headers: { 'token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: cleanPhone, text })
        });
        return res.ok;
    } catch (e) {
        console.error(`[REMINDER] Error sending to ${to}:`, e);
        return false;
    }
}
