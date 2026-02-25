// Version: 1.0.8 - Direct Admin Verification
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // 2. Define Context-Safe Logger & Variables
    let currentUserId = 'unknown';
    let currentInstanceId = 'unknown';

    const S_URL = Deno.env.get('SUPABASE_URL')
    const S_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // We recreate admin client inside to be safe
    const supabaseAdmin = createClient(S_URL ?? '', S_SERVICE_KEY ?? '');

    const logToDb = async (level: string, message: string, meta: any = {}) => {
        try {
            await supabaseAdmin.from('logs').insert({
                level,
                message,
                meta: { ...meta, userId: currentUserId, instanceId: currentInstanceId, v: '1.0.8' },
                service: 'whatsapp-manager'
            })
        } catch (e) { console.error('Log error:', e.message) }
    }

    try {
        // 3. Environment Validation
        const UAZ_URL = Deno.env.get('UAZAPI_URL')?.replace(/\/$/, '')
        const UAZ_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN')

        if (!UAZ_URL || !UAZ_TOKEN || !S_URL || !S_SERVICE_KEY) {
            const missing = [];
            if (!UAZ_URL) missing.push('UAZAPI_URL');
            if (!UAZ_TOKEN) missing.push('UAZAPI_ADMIN_TOKEN');
            if (!S_URL) missing.push('SUPABASE_URL');
            if (!S_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
            throw new Error(`Configuração ausente: ${missing.join(', ')}`);
        }

        const url = new URL(req.url)
        const action = url.searchParams.get('action')
        const phoneParam = url.searchParams.get('phone')

        // 4. Authentication (Direct Verification via Admin)
        console.log('🔍 [DEBUG] Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())))
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.log('❌ [DEBUG] Authorization header missing')
            throw new Error('Authorization header missing')
        }

        const token = authHeader.replace(/[Bb]earer\s+/, '').trim()
        console.log('🔍 [DEBUG] Token received (first 10 chars):', token.substring(0, 10))

        let user: any = null;
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
        user = userData?.user;

        if (!user) {
            console.error('❌ [DEBUG] Auth failed:', authError)
            throw new Error(`Auth failed: ${authError?.message || 'Invalid user'}`)
        }

        currentUserId = user.id;
        // Global instance lookup: find ANY active instance (shared across all users)
        const { data: existingInstance } = await supabaseAdmin.from('whatsapp_instances').select('instance_name').not('instance_name', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
        currentInstanceId = existingInstance?.instance_name || `sp_${user.id.substring(0, 8)}`;

        // URL and Action already declared above

        // 5. Uazapi Helper
        const uazapiFetch = async (path: string, options: any = {}) => {
            const method = options.method || 'GET'
            const body = options.body ? JSON.stringify(options.body) : undefined
            const fullUrl = `${UAZ_URL}${path.startsWith('/') ? path : `/${path}`}`;

            const headers: any = { 'Content-Type': 'application/json' };
            if (options.admin) {
                headers['admintoken'] = UAZ_TOKEN;
            } else if (options.token) {
                headers['token'] = options.token;
                headers['apikey'] = options.token;
            }

            try {
                const res = await fetch(fullUrl, { method, headers, body });
                const text = await res.text();
                let result; try { result = JSON.parse(text); } catch { result = text; }

                if (!res.ok) {
                    const msg = result?.error || result?.message || (typeof result === 'string' ? result : 'Unknown error');
                    throw new Error(`Uazapi [${res.status}]: ${msg}`);
                }
                return result;
            } catch (err: any) {
                if (err.name === 'TypeError') throw new Error(`Network error to Uazapi: ${err.message} (${fullUrl})`);
                throw err;
            }
        }

        const setupWebhook = async (instanceToken: string) => {
            const webhookUrl = `${S_URL}/functions/v1/ai-concierge-v5-final`;
            console.log(`[UAZAPI] Auto-configuring webhook for ${currentInstanceId} -> ${webhookUrl}`);

            try {
                const res = await uazapiFetch('/webhook', {
                    method: 'POST',
                    token: instanceToken,
                    body: {
                        url: webhookUrl,
                        enabled: true,
                        events: ['messages'],
                        excludeMessages: ['wasSentByApi', 'isGroupYes'],
                        addUrlEvents: false,
                        addUrlTypesMessages: false
                    }
                });
                console.log(`✅ [UAZAPI] Webhook auto-configured: ${JSON.stringify(res)}`);
                await logToDb('info', `Webhook auto-configured for ${currentInstanceId}`, {
                    url: webhookUrl,
                    events: ['messages'],
                    excludeMessages: ['wasSentByApi', 'isGroupYes'],
                    addUrlTypesMessages: true,
                    response: res
                });
                return res;
            } catch (e: any) {
                console.warn(`⚠️ [UAZAPI] Webhook setup failed: ${e.message}`);
                await logToDb('warn', `Webhook setup failed for ${currentInstanceId}`, { error: e.message });
                throw e;
            }
        }


        const detectConnection = (statusData: any) => {
            console.log(`[DEBUG] detectConnection for ${currentInstanceId}:`, JSON.stringify(statusData));

            const rawStatus = String(statusData.instance?.status || statusData.status || statusData.state || '').toLowerCase();
            const connectedKeywords = ['connected', 'open', 'authenticated', 'online', 'conectado'];

            const hasConnectedKeyword = connectedKeywords.some(k => rawStatus.includes(k));

            return hasConnectedKeyword ||
                statusData.status?.connected === true ||
                statusData.instance?.state === 'open' ||
                statusData.instance?.status === 'connected';
        }

        if (action === 'sync-instances') {
            await logToDb('info', 'Starting global instance sync');
            const listData: any = await uazapiFetch('/instance/all', { admin: true });
            const instances = Array.isArray(listData) ? listData : (listData?.instances || []);

            let syncCount = 0;
            for (const inst of instances) {
                const instName = inst.name || inst.instanceName;
                const instToken = inst.token;

                const { error: upsertErr } = await supabaseAdmin.from('whatsapp_instances').upsert({
                    instance_name: instName,
                    apikey: instToken,
                    status: inst.status || inst.state || 'connected',
                    phone_number: inst.owner || inst.number,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'instance_name' });

                // Auto-configure webhook and settings for every synced instance
                if (instToken) {
                    try {
                        currentInstanceId = instName;
                        await setupWebhook(instToken);

                        // Try to find if we have settings for this instance to re-apply
                        const { data: sData } = await supabaseAdmin.from('whatsapp_instances').select('settings').eq('instance_name', instName).maybeSingle();
                        if (sData?.settings) {
                            const s = sData.settings;
                            await uazapiFetch(`/instance/settings?name=${instName}`, {
                                method: 'POST',
                                token: instToken,
                                body: {
                                    rejectCall: s.rejectCalls || false,
                                    alwaysOnline: s.alwaysOnline || false,
                                    readMessages: s.autoRead || false,
                                    viewStatus: s.viewStatus || false,
                                    ignoreGroups: s.ignoreGroups || false,
                                    syncOnReconnect: s.historySync || false
                                }
                            });
                        }
                    } catch (whErr: any) {
                        console.warn(`⚠️ [SYNC] Webhook/Settings setup failed for ${instName}: ${whErr.message}`);
                    }
                }

                if (!upsertErr) syncCount++;
            }

            await logToDb('info', `Sync completed: ${syncCount} instances updated`);
            return new Response(JSON.stringify({ success: true, count: syncCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (action === 'diag') {
            const listData: any = await uazapiFetch('/instance/all', { admin: true });
            const instances = Array.isArray(listData) ? listData : (listData?.instances || []);
            const found = instances.find((i: any) => i.name === currentInstanceId || i.instanceName === currentInstanceId);
            if (found && found.token) {
                await supabaseAdmin.from('whatsapp_instances').upsert({ user_id: user.id, instance_name: currentInstanceId, apikey: found.token });
                return new Response(JSON.stringify({ success: true, tokenFound: true, status: found.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ success: false, instances: instances.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // --- ACTIONS ---
        if (action === 'status') {
            const { data: instData } = await supabaseAdmin.from('whatsapp_instances').select('*').eq('instance_name', currentInstanceId).maybeSingle()
            let token = instData?.apikey
            let currentName = currentInstanceId;
            let statusData = null;

            // 1. Authoritative check via Discovery (Admin)
            try {
                const listData: any = await uazapiFetch('/instance/all', { admin: true });
                const instances = Array.isArray(listData) ? listData : (listData?.instances || []);
                const found = instances.find((i: any) => i.name === currentInstanceId || i.instanceName === currentInstanceId);

                if (found) {
                    statusData = found;
                    console.log(`[UAZAPI] Instance ${currentName} found in list. Status: ${statusData.status || statusData.state}`);

                    if (found.token && found.token !== token) {
                        token = found.token;
                        console.log(`[UAZAPI] Token mismatch found. Updating DB.`);
                        await supabaseAdmin.from('whatsapp_instances').upsert({ user_id: user.id, instance_name: currentName, apikey: token });
                    }
                }
            } catch (discoveryErr: any) {
                console.warn('[UAZAPI] Discovery list failed:', discoveryErr.message);
            }

            // 2. Individual check fallback if discovery didn't find/work
            if (!statusData && token) {
                try {
                    statusData = await uazapiFetch('/instance/status', { token });
                } catch (e: any) {
                    console.warn(`[UAZAPI] Individual status check failed: ${e.message}`);
                    // Minimal probe
                    try { statusData = await uazapiFetch('', { token }); } catch { /* ignore */ }
                }
            }

            if (!statusData) {
                return new Response(JSON.stringify({ status: 'disconnected', error: 'Could not fetch status from Uazapi' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            const isConnected = detectConnection(statusData);

            const profileName = statusData.profileName || statusData.pushname || statusData.instance?.profileName || statusData.instanceName || statusData.name;
            const profileNumber = statusData.owner || statusData.instance?.wid?.split(':')[0] || statusData.me?.id?.split('@')[0] || statusData.instance?.number || statusData.phone;

            const response = {
                status: isConnected ? 'connected' : (instData?.qr_code ? 'connecting' : 'disconnected'),
                qrcode: instData?.qr_code,
                profile: isConnected ? {
                    name: profileName || 'WhatsApp User',
                    number: profileNumber,
                    avatar: statusData.profilePicUrl || statusData.instance?.profilePicUrl || statusData.avatar
                } : null
            }

            // Auto-setup webhook and Neural Behavior settings if connected but not yet configured
            if (isConnected && token) {
                await setupWebhook(token);

                // CRITICAL: Re-apply Neural Behavior settings on reconnect
                if (instData?.settings) {
                    console.log(`[UAZAPI] Re-applying Neural Behavior settings for ${currentInstanceId}`);
                    try {
                        const s = instData.settings;
                        await uazapiFetch(`/instance/settings?name=${currentInstanceId}`, {
                            method: 'POST',
                            token: token,
                            body: {
                                rejectCall: s.rejectCalls || false,
                                alwaysOnline: s.alwaysOnline || false,
                                readMessages: s.autoRead || false,
                                viewStatus: s.viewStatus || false,
                                ignoreGroups: s.ignoreGroups || false,
                                syncOnReconnect: s.historySync || false
                            }
                        });
                        await logToDb('info', `Neural Behavior settings re-applied for ${currentInstanceId}`);
                    } catch (sErr: any) {
                        console.warn(`⚠️ [UAZAPI] Settings re-apply failed: ${sErr.message}`);
                    }
                }
            }

            // Update global instance row (not user-specific)
            await supabaseAdmin.from('whatsapp_instances').update({
                instance_name: currentInstanceId,
                status: response.status,
                phone_number: profileNumber,
                qr_code: typeof response.qrcode === 'string' ? response.qrcode : null,
                updated_at: new Date().toISOString()
            }).eq('instance_name', currentInstanceId)

            // Fallback: If no row exists at all, create one linked to current user
            const { data: checkRow } = await supabaseAdmin.from('whatsapp_instances').select('id').eq('instance_name', currentInstanceId).maybeSingle();
            if (!checkRow) {
                await supabaseAdmin.from('whatsapp_instances').insert({
                    user_id: user.id,
                    instance_name: currentInstanceId,
                    status: response.status,
                    phone_number: profileNumber,
                    qr_code: typeof response.qrcode === 'string' ? response.qrcode : null,
                    updated_at: new Date().toISOString()
                })
            }

            return new Response(JSON.stringify(response), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }


        if (action === 'connect') {
            let initData;
            try {
                initData = await uazapiFetch('/instance/init', {
                    method: 'POST', admin: true,
                    body: { name: currentInstanceId, instanceName: currentInstanceId, token: currentInstanceId } // Set token explicit
                });
            } catch (e: any) {
                console.log('⚠️ [DEBUG] Init failed (maybe exists?), trying to find instance...', e.message);
            }

            let token = initData?.instance?.token || initData?.token || initData?.hash?.token;

            if (!token) {
                console.log('🔍 [DEBUG] Token not in init response, searching list...');
                const listData: any = await uazapiFetch('/instance/all', { admin: true });
                const instances = Array.isArray(listData) ? listData : (listData?.instances || []);
                const found = instances.find((i: any) => i.instanceName === currentInstanceId || i.name === currentInstanceId);
                token = found?.token || found?.hash?.token;
            }

            if (!token) {
                // Last resort: forceful creation with a random suffix if the name is stuck
                console.log('⚠️ [DEBUG] Still no token, trying forceful creation with suffix...');
                const altId = `${currentInstanceId}_${Math.floor(Math.random() * 1000)}`;
                const forceInit = await uazapiFetch('/instance/init', {
                    method: 'POST', admin: true,
                    body: { name: altId, instanceName: altId, token: altId }
                });
                token = forceInit?.instance?.token || forceInit?.token || forceInit?.hash?.token;
                currentInstanceId = altId; // Update reference for DB
            }

            if (!token) throw new Error('Falha crítica: Não foi possível criar ou recuperar o token da instância.');

            const connData = await uazapiFetch('/instance/connect', {
                method: 'POST', token,
                body: phoneParam ? { phone: phoneParam.replace(/\D/g, '') } : {}
            });

            const qrCode = connData.instance?.qrcode || connData.qrcode?.base64 || connData.base64 || connData.qrcode
            const pairCode = connData.instance?.paircode || connData.paircode

            if (token && connData.status === 'connected') {
                await setupWebhook(token);
            }

            // Update global instance row
            await supabaseAdmin.from('whatsapp_instances').update({
                instance_name: currentInstanceId,
                apikey: token,
                qr_code: typeof qrCode === 'string' ? qrCode : (qrCode?.base64 || qrCode?.code),
                status: 'connecting',
                updated_at: new Date().toISOString()
            }).eq('instance_name', currentInstanceId)

            // Fallback: If no row exists, create one linked to current user
            const { data: checkRowConnect } = await supabaseAdmin.from('whatsapp_instances').select('id').eq('instance_name', currentInstanceId).maybeSingle();
            if (!checkRowConnect) {
                await supabaseAdmin.from('whatsapp_instances').insert({
                    user_id: user.id,
                    instance_name: currentInstanceId,
                    apikey: token,
                    qr_code: typeof qrCode === 'string' ? qrCode : (qrCode?.base64 || qrCode?.code),
                    status: 'connecting',
                    updated_at: new Date().toISOString()
                })
            }

            return new Response(JSON.stringify({
                status: 'connecting',
                qrcode: typeof qrCode === 'string' ? qrCode : (qrCode?.base64 || qrCode?.code),
                pairingCode: pairCode
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'save-settings') {
            const body = await req.json()
            await logToDb('info', 'Saving settings', { body });

            // 1. Update whatsapp_instances settings (global, not per-user)
            const { error } = await supabaseAdmin.from('whatsapp_instances').update({
                settings: body,
                updated_at: new Date().toISOString()
            }).eq('instance_name', currentInstanceId)

            if (error) {
                await logToDb('error', 'Save settings failed', { error });
                throw error
            }

            // 2. Sync to Uazapi Instance Settings (CRITICAL for neural behaviors)
            try {
                const { data: inst } = await supabaseAdmin
                    .from('whatsapp_instances')
                    .select('apikey, instance_name')
                    .eq('instance_name', currentInstanceId)
                    .maybeSingle();

                if (inst && inst.apikey) {
                    await uazapiFetch(`/instance/settings?name=${inst.instance_name}`, {
                        method: 'POST',
                        token: inst.apikey,
                        body: {
                            rejectCall: body.rejectCalls || false,
                            alwaysOnline: body.alwaysOnline || false,
                            readMessages: body.autoRead || false,
                            viewStatus: body.viewStatus || false,
                            ignoreGroups: body.ignoreGroups || false,
                            syncOnReconnect: body.historySync || false
                        }
                    });
                    await logToDb('info', 'Uazapi settings synced successfully');
                }
            } catch (uazErr: any) {
                await logToDb('warn', 'Uazapi settings sync failed', { error: uazErr.message });
            }
            try {
                const syncData = [
                    { key: 'WHITELIST_ENABLED', value: String(body.whitelistEnabled || false) },
                    { key: 'WHITELIST_NUMBERS', value: JSON.stringify(body.whitelistNumbers || []) },
                    { key: 'AI_ALLOWED_NUMBERS', value: (body.whitelistNumbers || []).join(',') },
                    { key: 'BLACKLIST_NUMBERS', value: JSON.stringify(body.blacklistNumbers || []) },
                    { key: 'HUMAN_HANDOVER_NUMBER', value: body.handoverNumber || '' },
                    { key: 'TEST_WHITELIST_NUMBER', value: (body.whitelistNumbers || [])[0] || '' } // Fallback for single-number scripts
                ];

                for (const item of syncData) {
                    await supabaseAdmin.from('app_config').upsert(item, { onConflict: 'key' });
                }
                await logToDb('info', 'Synced settings to app_config successfully');
            } catch (syncErr: any) {
                await logToDb('warn', 'Sync to app_config had issues', { error: syncErr.message });
            }

            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'delete-instance') {
            const { data: instances } = await supabaseAdmin
                .from('whatsapp_instances')
                .select('apikey, instance_name')
                .eq('instance_name', currentInstanceId);

            if (instances && instances.length > 0) {
                await logToDb('info', `[DELETE] Found ${instances.length} instances to clean up`);

                for (const inst of instances) {
                    const instName = inst.instance_name;
                    const instToken = inst.apikey;

                    try {
                        await logToDb('info', `[DELETE] Attempting teardown for ${instName}`);

                        // Strategy 1: Disconnect/Logout first (Graceful)
                        try {
                            await uazapiFetch(`/instance/logout?name=${instName}`, { method: 'POST', token: instToken });
                        } catch (e) {
                            console.warn(`Logout failed for ${instName}, proceeding to delete`);
                        }

                        // Strategy 2: DELETE /instance (Verified pattern)
                        await uazapiFetch(`/instance?name=${instName}`, { method: 'DELETE', token: instToken });

                        // Strategy 3: DELETE /instance/delete (Backup pattern)
                        try {
                            await uazapiFetch(`/instance/delete?name=${instName}`, { method: 'DELETE', token: instToken });
                        } catch (e) { }

                        await logToDb('info', `[DELETE] Success: ${instName} removed from Uazapi`);
                    } catch (e: any) {
                        await logToDb('error', `[DELETE] Failed to remove ${instName} from Uazapi: ${e.message}`);

                        // Final Fallback: Admin lookup and delete
                        try {
                            const listData: any = await uazapiFetch('/instance/all', { admin: true });
                            const list = Array.isArray(listData) ? listData : (listData.data || listData.instances || []);
                            const found = list.find((i: any) => i.name === instName || i.instanceName === instName);

                            if (found) {
                                await uazapiFetch(`/instance?name=${instName}`, { method: 'DELETE', admin: true });
                                await logToDb('info', `[DELETE] Success: ${instName} deleted via Admin fallback`);
                            }
                        } catch (adminErr: any) {
                            console.error('Admin cleanup fallback failed:', adminErr.message);
                        }
                    }
                }
            }

            // Soft delete: Clear connection info but KEEP settings
            await supabaseAdmin.from('whatsapp_instances').update({
                instance_name: null,
                apikey: null,
                status: 'disconnected',
                qrcode: null,
                profile: null
            }).eq('instance_name', currentInstanceId);
            return new Response(JSON.stringify({ success: true, count: instances?.length || 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'get-settings') {
            const { data, error } = await supabaseAdmin.from('whatsapp_instances').select('settings').eq('instance_name', currentInstanceId).maybeSingle()
            if (error) await logToDb('error', 'Get settings failed', { error });
            await logToDb('info', 'Fetched settings', { settings: data?.settings });
            return new Response(JSON.stringify(data?.settings || {}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        throw new Error(`Action '${action}' not found`)

    } catch (e: any) {
        console.error('Edge Function Error:', e.message)

        return new Response(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
});
