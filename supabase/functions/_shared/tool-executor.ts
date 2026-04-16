import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

export interface ToolExecutorContext {
    supabase: SupabaseClient;
    tenantId: string;
    agentId: string;
    lead: any;
    agentName: string;
    cleanPhone: string;
    currentStep: any;
    funnelSteps: any[];
    config: any;
    uazBase: string;
    uazKey: string;
    remoteJid: string;
}

export interface ToolResult {
    executed: string[];
    mediaSent: boolean;
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

export async function executeTools(toolCalls: any[], context: ToolExecutorContext): Promise<ToolResult> {
    const executed: string[] = [];
    let mediaSent = false;
    const { supabase, tenantId, agentId, lead, agentName, cleanPhone, currentStep, funnelSteps, config, uazBase, uazKey, remoteJid } = context;

    for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments);
        const functionName = call.function.name;

        switch (functionName) {
            case 'update_lead': {
                await supabase.from('leads').update(args).eq('id', lead.id);
                executed.push(`UPDATED:${Object.keys(args).join(',')}`);
                break;
            }
            case 'schedule_appointment': {
                const dt = args.datetime?.includes("-03:00") ? args.datetime : `${args.datetime} -03:00`;
                const appointmentDate = new Date(dt);

                if (isNaN(appointmentDate.getTime())) {
                    console.error(`[V7 QA-Guard] LLM hallucinated an invalid date: ${args.datetime}`);
                    executed.push('INVALID_DATE_FORMAT');
                    break;
                }

                // Conflict detection
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
                    console.log(`[V7] Schedule conflict: ${conflicts.length} existing at ${args.datetime}`);
                } else {
                    await supabase.from('appointments').insert({
                        tenant_id: tenantId, lead_id: lead.id,
                        appointment_date: appointmentDate.toISOString(),
                        status: 'confirmed', ai_summary: args.summary
                    });

                    // Auto-update lead
                    const pipelineUpdate: any = { pipeline_stage: 'attending' };
                    if (['novo', 'frio'].includes(lead.status)) pipelineUpdate.status = 'morno';
                    await supabase.from('leads').update(pipelineUpdate).eq('id', lead.id);

                    executed.push('SCHEDULED');
                    await notifyAdmin(config, `🚀 **Novo Agendamento**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nData: ${args.datetime}`, uazBase, uazKey);
                }
                break;
            }
            case 'cancel_appointment': {
                await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);

                const { data: remaining } = await supabase.from('appointments')
                    .select('id').eq('lead_id', lead.id).eq('tenant_id', tenantId)
                    .in('status', ['confirmed', 'scheduled']);

                if (!remaining?.length) {
                    await supabase.from('leads').update({ pipeline_stage: 'new' }).eq('id', lead.id);
                }
                executed.push(`CANCELLED:${args.id}`);
                break;
            }
            case 'reschedule_appointment': {
                await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', args.id);
                const dt = args.datetime.includes("-03:00") ? args.datetime : `${args.datetime} -03:00`;
                const appointmentDate = new Date(dt);

                await supabase.from('appointments').insert({
                    tenant_id: tenantId, lead_id: lead.id,
                    appointment_date: appointmentDate.toISOString(),
                    status: 'confirmed', ai_summary: args.summary || 'Reagendamento'
                });
                executed.push(`RESCHEDULED:${args.id}`);
                await notifyAdmin(config, `🔄 **Reagendamento**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nNova data: ${args.datetime}`, uazBase, uazKey);
                break;
            }
            case 'advance_step': {
                if (currentStep && funnelSteps?.length) {
                    const nextStep = funnelSteps.find((s: any) => s.step_order === currentStep.step_order + 1);
                    if (nextStep) {
                        await supabase.from('leads').update({ current_funnel_step: nextStep.id }).eq('id', lead.id);
                        executed.push(`ADVANCED:${currentStep.name}->${nextStep.name}`);
                    }
                }
                break;
            }
            case 'create_follow_up': {
                await supabase.from('follow_up_logs').insert({
                    tenant_id: tenantId, agent_id: agentId, lead_id: lead.id,
                    status: 'pending', attempt_count: 0, max_attempts: 3
                });
                executed.push('FOLLOW_UP_CREATED');
                break;
            }
            case 'transfer_to_human': {
                await notifyAdmin(config, `🙋 **Transferência Solicitada**\nAgente: ${agentName}\nLead: ${lead.name || cleanPhone}\nMotivo: ${args.reason || 'Solicitação do cliente'}`, uazBase, uazKey);
                executed.push('TRANSFERRED');
                break;
            }
            case 'send_media': {
                const { data: mediaDoc } = await supabase.from('knowledge_documents')
                    .select('storage_path, title, mime_type')
                    .eq('id', args.media_id).single();

                if (mediaDoc?.storage_path) {
                    const { data: urlData } = supabase.storage.from('knowledge-files').getPublicUrl(mediaDoc.storage_path);
                    const mediaType = mediaDoc.mime_type?.startsWith('image/') ? 'image' : 'document';
                    const docName = mediaDoc.mime_type?.includes('pdf') ? `${mediaDoc.title}.pdf` : undefined;

                    await fetch(`${uazBase}/send/media`, {
                        method: 'POST',
                        headers: { 'token': uazKey, 'Content-Type': 'application/json' },
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
                } else {
                    executed.push('MEDIA_NOT_FOUND');
                }
                break;
            }
            default:
                console.log(`[V7] Unknown tool called: ${functionName}`);
                break;
        }
    }

    return { executed, mediaSent };
}
