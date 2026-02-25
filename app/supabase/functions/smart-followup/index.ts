
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? "";
const UAZAPI_URL = Deno.env.get('UAZAPI_URL') ?? "https://backstagefy.uazapi.com/api/v2";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
    try {
        console.log("[FOLLOW-UP] Starting Smart Follow-up scan...");

        // 1. Encontrar leads inativos (Budget A, B ou C) há mais de 30 minutos
        // E que não estejam em estágios finais
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString();

        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select(`
                id, 
                phone, 
                name, 
                company_name, 
                budget_range, 
                pipeline_stage,
                last_interaction
            `)
            .in('budget_range', ['A', 'B', 'C'])
            .not('pipeline_stage', 'in', '("scheduled", "booked", "human_handover", "lost")')
            .lte('last_interaction', thirtyMinsAgo)
            .limit(10); // Processar em lotes

        if (leadsError) throw leadsError;
        if (!leads || leads.length === 0) {
            console.log("[FOLLOW-UP] No inactive qualified leads found.");
            return new Response(JSON.stringify({ message: "No leads" }), { status: 200 });
        }

        console.log(`[FOLLOW-UP] Found ${leads.length} potential leads for follow-up.`);

        for (const lead of leads) {
            // 2. Verificar se a ÚLTIMA mensagem foi do Assistente (estamos esperando o lead)
            const { data: history, error: histError } = await supabase
                .from('chat_history')
                .select('role, content')
                .eq('lead_id', lead.id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (histError) continue;
            if (!history || history.length === 0 || history[0].role !== 'assistant') {
                console.log(`[FOLLOW-UP] Skipping lead ${lead.id} - last message was not from assistant.`);
                continue;
            }

            // 3. Verificar limite de tentativas
            const { data: logEntry } = await supabase
                .from('follow_up_logs')
                .select('attempt_count')
                .eq('lead_id', lead.id)
                .single();

            const attemptCount = logEntry?.attempt_count || 0;
            if (attemptCount >= 10) {
                console.log(`[FOLLOW-UP] Max attempts reached for lead ${lead.id}.`);
                continue;
            }

            // 4. Buscar contexto para gerar o nudge
            const { data: fullHistory } = await supabase
                .from('chat_history')
                .select('role, content')
                .eq('lead_id', lead.id)
                .order('created_at', { ascending: false })
                .limit(5);

            const contextStr = fullHistory?.reverse().map(m => `${m.role === 'user' ? 'Lead' : 'Haus'}: ${m.content}`).join('\n');

            const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // 5. Gerar o Nudge com GPT-4o
            const prompt = `
            Você é o Haus, consultor da spHAUS. 
            O lead abaixo parou de responder no meio da conversa.
            Gere uma "cutucada" (nudge) curta, elegante e contextual para re-engajar o lead.
            Não peça desculpas. Seja sutil e foque em um ponto mencionado antes ou no próximo passo (agendamento).
            
            DADOS DO LEAD:
            - Nome: ${lead.name || 'Desconhecido'}
            - Empresa: ${lead.company_name || 'Desconhecida'}
            - Budget: ${lead.budget_range}
            - Data/Hora Atual (Brasil): ${nowBR}
            
            HISTÓRICO ÚLTIMAS MENSAGENS:
            ${contextStr}
            
            RESPOSTA (Apenas o texto da mensagem, sem aspas, máximo 200 caracteres):
            `;

            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                })
            });

            const aiData = await aiRes.json();
            const nudge = aiData.choices?.[0]?.message?.content?.trim();

            if (!nudge) continue;

            // 6. Enviar via WhatsApp (Uazapi)
            const sent = await sendWhatsApp(lead.phone, nudge);

            if (sent) {
                // 7. Salvar no histórico e atualizar logs
                await supabase.from('chat_history').insert({
                    lead_id: lead.id,
                    role: 'assistant',
                    content: nudge,
                    metadata: { type: 'follow_up', attempt: attemptCount + 1 }
                });

                await supabase.from('leads').update({
                    last_interaction: new Date().toISOString()
                }).eq('id', lead.id);

                if (logEntry) {
                    const newLogs = [...(logEntry.logs || []), { sent_at: new Date().toISOString(), message: nudge }];
                    await supabase.from('follow_up_logs')
                        .update({
                            attempt_count: attemptCount + 1,
                            last_attempt_at: new Date().toISOString(),
                            logs: newLogs
                        })
                        .eq('lead_id', lead.id);
                } else {
                    await supabase.from('follow_up_logs').insert({
                        lead_id: lead.id,
                        attempt_count: 1,
                        last_attempt_at: new Date().toISOString(),
                        logs: [{ sent_at: new Date().toISOString(), message: nudge }]
                    });
                }

                console.log(`[FOLLOW-UP] Nudge sent to ${lead.phone} (Attempt ${attemptCount + 1})`);
            }
        }

        return new Response(JSON.stringify({ status: "done" }), { status: 200 });

    } catch (err) {
        console.error("[FOLLOW-UP] Critical error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});

async function sendWhatsApp(to: string, text: string) {
    const cleanPhone = to.replace(/\D/g, "");
    const finalNumber = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;
    const UAZ_API_TOKEN = Deno.env.get('UAZAPI_TOKEN') ?? "";

    try {
        const res = await fetch(`${UAZAPI_URL}/send/text`, {
            method: "POST",
            headers: { "token": UAZ_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ number: finalNumber, text: text })
        });
        return res.status === 200 || res.status === 201;
    } catch (e) {
        console.error("[FOLLOW-UP] Failed to send WS", e);
        return false;
    }
}
