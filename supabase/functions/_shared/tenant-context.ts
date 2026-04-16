import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

export async function resolveTenantAndAgent(supabase: SupabaseClient, payload: any) {
    const instanceName = payload.instance || payload.instanceName || payload.instance_key || payload.name;

    if (!instanceName) {
        return { error: 'no instance' };
    }

    const { data: instanceRow } = await supabase.from('whatsapp_instances')
        .select('tenant_id, agent_id, apikey')
        .eq('instance_name', instanceName)
        .single();

    if (!instanceRow?.tenant_id) {
        return { error: 'unknown instance' };
    }

    return {
        tenantId: instanceRow.tenant_id,
        resolvedAgentId: instanceRow.agent_id,
        apikey: instanceRow.apikey,
        instanceName
    };
}

export async function checkGuards(supabase: SupabaseClient, tenantId: string, cleanPhone: string, isGroup: boolean) {
    const { data: tenantData } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single();
    const config = tenantData?.settings || {};
    const tenantName = tenantData?.name || '';

    if (isGroup && config.ignoreGroups === true) return { blocked: true, reason: "ignored group" };

    if (config.whitelistEnabled === true) {
        const allowed = Array.isArray(config.whitelistNumbers) ? config.whitelistNumbers : [];
        if (allowed.length > 0 && !allowed.includes(cleanPhone)) {
            return { blocked: true, reason: "unauthorized" };
        }
    }

    const blacklist = Array.isArray(config.blacklistNumbers) ? config.blacklistNumbers : [];
    if (blacklist.length > 0 && blacklist.includes(cleanPhone)) {
        return { blocked: true, reason: "blacklisted" };
    }

    return { blocked: false, config, tenantName };
}
