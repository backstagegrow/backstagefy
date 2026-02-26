import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Unauthorized: Missing Authorization header");

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Extract user ID from JWT (signature already verified by Supabase Edge Runtime)
        const token = authHeader.replace('Bearer ', '');
        let userId: string;
        try {
            // JWT uses base64url, convert to standard base64 for atob()
            let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const payload = JSON.parse(atob(base64));
            userId = payload.sub;
            if (!userId) throw new Error("Missing sub claim");
            console.log(`[whatsapp-manager] Authenticated user: ${userId}`);
        } catch (e) {
            console.error("[whatsapp-manager] JWT decode error:", e);
            throw new Error("Unauthorized: Invalid JWT");
        }

        const { data: tenantMember, error: tmError } = await supabase
            .from('tenant_members')
            .select('tenant_id')
            .eq('user_id', userId)
            .limit(1)
            .single();

        if (tmError || !tenantMember) throw new Error("Tenant required: User does not belong to any tenant.");
        const tenantId = tenantMember.tenant_id;
        const tenantInstanceName = `bsf_${tenantId.replace(/-/g, '').substring(0, 8)}`;

        // 2. Fetch global Uazapi config
        const { data: configRows, error: configError } = await supabase.from('app_config').select('key, value').in('key', ['UAZAPI_KEY', 'UAZAPI_BASE_URL']);
        if (configError) console.error("[whatsapp-manager] Config Error:", configError);
        const config = Object.fromEntries(configRows?.map(r => [r.key, r.value]) || []);

        const UAZAPI_KEY = config['UAZAPI_KEY'];
        const UAZAPI_BASE_URL = config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com';
        const SUPABASE_PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
        const INSTANCE_NAME = tenantInstanceName;

        // Fetch specific instance token from whatsapp_instances table
        const { data: instanceRow } = await supabase.from('whatsapp_instances').select('apikey').eq('instance_name', INSTANCE_NAME).single();
        let INSTANCE_TOKEN = instanceRow?.apikey;
        const ADMIN_TOKEN = UAZAPI_KEY;

        // Auto-discover token from Uazapi if not in DB
        if (!INSTANCE_TOKEN) {
            console.log(`[whatsapp-manager] Token not found in DB for ${INSTANCE_NAME}, discovering via /instance/all...`);
            try {
                const allRes = await fetch(`${UAZAPI_BASE_URL}/instance/all`, { method: "GET", headers: { "admintoken": ADMIN_TOKEN } });
                const allData = await allRes.json();
                const instances = Array.isArray(allData) ? allData : [allData];
                const found = instances.find((i: any) => i.name === INSTANCE_NAME);
                if (found?.token) {
                    INSTANCE_TOKEN = found.token;
                    console.log(`[whatsapp-manager] Discovered token for ${INSTANCE_NAME}: ${INSTANCE_TOKEN.substring(0, 8)}...`);
                    // Save to DB for future use
                    await supabase.from('whatsapp_instances').upsert({
                        tenant_id: tenantId,
                        instance_name: INSTANCE_NAME,
                        apikey: INSTANCE_TOKEN,
                        status: found.status || 'disconnected',
                        phone_number: found.owner || ''
                    }, { onConflict: 'instance_name' });
                }
            } catch (e) {
                console.error("[whatsapp-manager] Auto-discover failed:", e);
            }
        }
        if (!INSTANCE_TOKEN) INSTANCE_TOKEN = ADMIN_TOKEN;

        const url = new URL(req.url);
        const action = url.searchParams.get("action");
        const phone = url.searchParams.get("phone");

        console.log(`[whatsapp-manager] Action: ${action}, BaseURL: ${UAZAPI_BASE_URL}`);

        const uazapiAuthHeader = { "Authorization": `Bearer ${UAZAPI_KEY || ""}` };
        // Hybrid support for older/different Uazapi versions
        const fallbackHeader = { "apikey": UAZAPI_KEY || "" };

        async function uazapiFetch(path: string, options: any = {}) {
            const fullUrl = `${UAZAPI_BASE_URL}${path}`;
            console.log(`[whatsapp-manager] Fetching: ${fullUrl}`);

            // Headers to try in order
            const headersToTry = [
                { "apikey": INSTANCE_TOKEN },
                { "token": INSTANCE_TOKEN },
                { "Authorization": `Bearer ${INSTANCE_TOKEN}` },
                { "admintoken": ADMIN_TOKEN },
                { "apikey": UAZAPI_KEY },
                { "token": UAZAPI_KEY }
            ];

            let res, data;
            let lastError = null;

            for (const headers of headersToTry) {
                const headerName = Object.keys(headers)[0];
                const headerValue = headers[headerName];
                if (!headerValue) continue;

                console.log(`[whatsapp-manager] Attempting ${fullUrl} with ${headerName}: ${headerValue.substring(0, 5)}...`);

                try {
                    res = await fetch(fullUrl, {
                        ...options,
                        headers: { ...headers, ...options.headers }
                    });

                    const text = await res.text();
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = { text };
                    }

                    console.log(`[whatsapp-manager] ${headerName} Result: ${res.status}`, data);

                    if (res.status < 400 || (res.status !== 401 && !(data && data.code === 401))) {
                        console.log(`[whatsapp-manager] SUCCESS with ${headerName}`);
                        return { res, data };
                    }
                    lastError = data;
                } catch (err) {
                    console.error(`[whatsapp-manager] Fetch error with ${headerName}:`, err);
                }
            }

            if (res && res.status === 404 && !path.startsWith("/v2") && !path.startsWith("/api")) {
                console.log(`[whatsapp-manager] 404 detected, trying with /v2 prefix...`);
                return await uazapiFetch(`/v2${path}`, options);
            }

            return { res, data: data || lastError };
        }

        const normalizeResponse = (uazData: any) => {
            const instance = uazData?.instance || uazData;
            // Handle both Uazapi V1 and V2 names
            const rawStatus = instance?.status || instance?.state || (uazData?.status?.connected ? 'open' : (uazData?.status ? 'close' : null));

            const statusMap: Record<string, string> = {
                'open': 'connected',
                'connected': 'connected',
                'close': 'disconnected',
                'disconnected': 'disconnected',
                'connecting': 'connecting'
            };

            const status = statusMap[rawStatus] || (instance?.qrcode ? 'connecting' : 'disconnected');

            // Profile info for connected state
            const profile = (status === 'connected') ? {
                name: instance?.profileName || instance?.name || 'WhatsApp User',
                number: instance?.owner || instance?.number || uazData?.status?.jid?.split(':')[0] || '',
                avatar: instance?.profilePicUrl || instance?.avatar || null
            } : null;

            // Extract pairing code only if it looks like a valid string code (not a number like 401)
            const rawPairCode = instance?.paircode || instance?.code || uazData?.code;
            const pairingCode = (typeof rawPairCode === 'string' && rawPairCode.length > 4) ? rawPairCode : null;

            return {
                status,
                qrcode: instance?.qrcode || instance?.base64 || uazData?.base64 || null,
                pairingCode,
                profile,
                raw: uazData
            };
        };

        async function ensureInstanceExists() {
            console.log(`[whatsapp-manager] Ensuring instance '${INSTANCE_NAME}' exists...`);
            const { res: statusRes, data: statusData } = await uazapiFetch("/instance/status", { method: "GET" });

            // If we get an instance ID or a 200, it exists
            if (statusRes && statusRes.status === 200 && (statusData?.instance?.id || statusData?.instance?.status)) {
                console.log(`[whatsapp-manager] Instance already exists: ${statusData.instance.id}`);
                return INSTANCE_TOKEN;
            }

            console.log(`[whatsapp-manager] Instance info missing (Status: ${statusRes?.status}). Creating via /instance/init...`);
            const createRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "admintoken": ADMIN_TOKEN },
                body: JSON.stringify({ name: INSTANCE_NAME })
            });

            const createData = await createRes.json();
            if (createRes.ok && createData.token) {
                // Upsert to whatsapp_instances
                await supabase.from('whatsapp_instances').upsert({
                    tenant_id: tenantId,
                    instance_name: INSTANCE_NAME,
                    apikey: createData.token,
                    status: 'disconnected',
                    user_id: userId
                }, { onConflict: 'instance_name' });
                return createData.token;
            }
            return INSTANCE_TOKEN; // Fallback to current token if init "fails" but instance might still work
        }

        if (action === "sync-instances") {
            console.log(`[whatsapp-manager] Syncing all instances from Uazapi...`);
            // Confirmed endpoint: /instance/all with admintoken header
            const syncRes = await fetch(`${UAZAPI_BASE_URL}/instance/all`, {
                method: "GET",
                headers: { "admintoken": ADMIN_TOKEN }
            });
            const syncData = await syncRes.json();
            console.log(`[whatsapp-manager] /instance/all status: ${syncRes.status}, count: ${Array.isArray(syncData) ? syncData.length : 0}`);

            if (syncRes.ok && Array.isArray(syncData)) {
                for (const inst of syncData) {
                    const instName = inst.name || inst.instanceName;
                    const instToken = inst.token || inst.apikey;
                    const instStatus = inst.status === 'connected' ? 'connected' : 'disconnected';
                    console.log(`[whatsapp-manager] Syncing instance: ${instName}, status: ${instStatus}`);
                    await supabase.from('whatsapp_instances').upsert({
                        instance_name: instName,
                        phone_number: inst.number || inst.owner || '',
                        status: instStatus,
                        apikey: instToken || INSTANCE_TOKEN,
                        user_id: '29f6e9f9-8a8a-4b74-a55c-7bf054e3db61'
                    }, { onConflict: 'instance_name', ignoreDuplicates: false });
                }
            }

            return new Response(JSON.stringify({ success: syncRes.ok || false, count: Array.isArray(syncData) ? syncData.length : 0 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "connect") {
            const newToken = await ensureInstanceExists();
            const activeToken = newToken || INSTANCE_TOKEN || ADMIN_TOKEN;
            console.log(`[whatsapp-manager] Connecting with token: ${activeToken?.substring(0, 8)}...`);

            // Try connecting with different auth header names for Uazapi compat
            let connectData: any = null;
            for (const headerName of ["apikey", "token", "admintoken"]) {
                try {
                    const connectRes = await fetch(`${UAZAPI_BASE_URL}/instance/connect`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", [headerName]: activeToken },
                        body: JSON.stringify(phone ? { phone } : {})
                    });
                    const text = await connectRes.text();
                    try { connectData = JSON.parse(text); } catch { connectData = { text }; }
                    console.log(`[whatsapp-manager] /instance/connect with ${headerName}: ${connectRes.status}`, JSON.stringify(connectData).substring(0, 200));
                    if (connectRes.ok || connectData?.base64 || connectData?.qrcode || connectData?.instance?.qrcode) break;
                } catch (e) {
                    console.error(`[whatsapp-manager] connect with ${headerName} failed:`, e);
                }
            }

            // --- AUTO WEBHOOK SETUP (multi-endpoint retry for UazapiGO) ---
            const webhookUrl = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/ai-concierge-v5-final`;
            console.log(`[whatsapp-manager] Auto-setting webhook: ${webhookUrl}`);
            const webhookBody = JSON.stringify({
                url: webhookUrl, enabled: true, webhook_url: webhookUrl, webhook_enabled: true,
                events: ["message", "messages.upsert", "status", "connection", "chat.upsert"],
                autoDownload: true, decryptMedia: true
            });
            const webhookEndpoints = [
                { path: "/instance/webhook", method: "PUT" },
                { path: "/instance/webhook", method: "POST" },
                { path: "/webhook", method: "PUT" },
                { path: "/webhook", method: "POST" },
            ];
            const webhookHeaders = [
                { "apikey": activeToken },
                { "token": activeToken },
                { "admintoken": ADMIN_TOKEN },
            ];
            let webhookSet = false;
            for (const ep of webhookEndpoints) {
                if (webhookSet) break;
                for (const hdr of webhookHeaders) {
                    try {
                        const wRes = await fetch(`${UAZAPI_BASE_URL}${ep.path}`, {
                            method: ep.method,
                            headers: { "Content-Type": "application/json", ...hdr },
                            body: webhookBody
                        });
                        const wText = await wRes.text();
                        console.log(`[whatsapp-manager] Webhook ${ep.method} ${ep.path} [${Object.keys(hdr)[0]}]: ${wRes.status} ${wText.substring(0, 100)}`);
                        if (wRes.ok) { webhookSet = true; break; }
                    } catch (e: any) {
                        console.error(`[whatsapp-manager] Webhook ${ep.method} ${ep.path} error:`, e.message);
                    }
                }
            }
            if (!webhookSet) console.error("[whatsapp-manager] ⚠️ Could not set webhook on any endpoint!");

            return new Response(JSON.stringify(normalizeResponse(connectData)), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "status") {
            const activeToken = INSTANCE_TOKEN || ADMIN_TOKEN;
            let statusData: any = null;
            for (const headerName of ["apikey", "token", "admintoken"]) {
                try {
                    const statusRes = await fetch(`${UAZAPI_BASE_URL}/instance/status`, {
                        method: "GET",
                        headers: { [headerName]: activeToken }
                    });
                    const text = await statusRes.text();
                    try { statusData = JSON.parse(text); } catch { statusData = { text }; }
                    console.log(`[whatsapp-manager] /instance/status with ${headerName}: ${statusRes.status}`, JSON.stringify(statusData).substring(0, 200));
                    if (statusRes.ok && statusRes.status !== 401) break;
                } catch (e) {
                    console.error(`[whatsapp-manager] status with ${headerName} failed:`, e);
                }
            }

            const normalized = normalizeResponse(statusData);

            // Sync status to DB
            if (normalized.status === 'connected' && normalized.profile) {
                await supabase.from('whatsapp_instances').update({
                    status: 'connected',
                    phone_number: normalized.profile.number || ''
                }).eq('instance_name', INSTANCE_NAME);
            }

            return new Response(JSON.stringify(normalized), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "setup-webhook") {
            const webhookUrl = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/ai-concierge-v5-final`;
            console.log(`[whatsapp-manager] Setting webhook to: ${webhookUrl}`);
            // Confirmed endpoint: POST /webhook with instance 'token' header
            const hookRes = await fetch(`${UAZAPI_BASE_URL}/webhook`, {
                method: "POST",
                headers: { "token": INSTANCE_TOKEN, "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: webhookUrl,
                    enabled: true,
                    events: ["message", "messages.upsert", "status", "connection", "chat.upsert"],
                    autoDownload: true,
                    decryptMedia: true
                })
            });
            const hookData = await hookRes.json();
            console.log(`[whatsapp-manager] Webhook setup result: ${hookRes.status}`, hookData);
            return new Response(JSON.stringify({ success: hookRes.ok || false, data: hookData, webhookUrl }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "get-settings") {
            const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            const settings = tenant?.settings || {};

            return new Response(JSON.stringify({
                whitelistEnabled: settings.whitelistEnabled === true,
                whitelistNumbers: settings.whitelistNumbers || [],
                handoverNumber: settings.handoverNumber || '',
                rejectCalls: settings.rejectCalls === true,
                ignoreGroups: settings.ignoreGroups === true,
                viewStatus: settings.viewStatus === true,
                autoRead: settings.autoRead === true,
                alwaysOnline: settings.alwaysOnline === true,
                historySync: settings.historySync === true
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "save-settings") {
            const body = await req.json();

            // Get current settings first
            const { data: currentTenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            const currentSettings = currentTenant?.settings || {};

            // Merge settings
            const updatedSettings = {
                ...currentSettings,
                whitelistEnabled: Boolean(body.whitelistEnabled),
                whitelistNumbers: Array.isArray(body.whitelistNumbers) ? body.whitelistNumbers : [],
                handoverNumber: String(body.handoverNumber || ''),
                rejectCalls: Boolean(body.rejectCalls),
                ignoreGroups: Boolean(body.ignoreGroups),
                viewStatus: Boolean(body.viewStatus),
                autoRead: Boolean(body.autoRead),
                alwaysOnline: Boolean(body.alwaysOnline),
                historySync: Boolean(body.historySync)
            };

            const { error } = await supabase.from('tenants').update({ settings: updatedSettings }).eq('id', tenantId);

            if (error) throw error;

            // --- SYNC WITH UAZAPI ---
            try {
                // Presence (Always Online)
                if (body.alwaysOnline !== undefined) {
                    await uazapiFetch("/instance/presence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ presence: body.alwaysOnline ? "available" : "unavailable" })
                    });
                }

                // Privacy Settings (Read Receipts)
                if (body.autoRead !== undefined) {
                    await uazapiFetch("/instance/privacy", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ readReceipts: body.autoRead })
                    });
                }
            } catch (syncErr) {
                console.error("[whatsapp-manager] Uazapi Sync Error:", syncErr);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "delete-instance") {
            try {
                // Try multiple endpoints to ensure termination in different Uazapi versions
                console.log(`[whatsapp-manager] Attempting to terminate instance...`);
                await uazapiFetch("/instance/logout", { method: "POST" });
                await uazapiFetch("/instance/terminate", { method: "DELETE" });
                await uazapiFetch("/instance/delete", { method: "DELETE" });
                await uazapiFetch("/instance", { method: "DELETE" });
            } catch (err) {
                console.error("[whatsapp-manager] Delete attempt error (ignoring):", err);
            }

            // Clear local state regardless of API result to ensure UI reset
            await supabase.from('whatsapp_instances').delete().eq('instance_name', INSTANCE_NAME);

            return new Response(JSON.stringify({ success: true, message: "Instance cleared locally and cleanup attempted on API" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error(`[whatsapp-manager] Fatal Error:`, e.message);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
