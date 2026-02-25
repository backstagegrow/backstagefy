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
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch config
        const { data: configRows, error: configError } = await supabase.from('app_config').select('key, value');
        if (configError) console.error("[whatsapp-manager] Config Error:", configError);
        const config = Object.fromEntries(configRows?.map(r => [r.key, r.value]) || []);
        console.log("[whatsapp-manager] Config keys found:", Object.keys(config));

        const UAZAPI_KEY = config['UAZAPI_KEY'];
        // Use a dedicated token if available, otherwise fallback to the master key
        const INSTANCE_TOKEN = config['UAZAPI_INSTANCE_TOKEN'] || UAZAPI_KEY;
        const ADMIN_TOKEN = config['UAZAPI_ADMIN_TOKEN'] || UAZAPI_KEY;

        const UAZAPI_BASE_URL = config['UAZAPI_BASE_URL'] || 'https://backstagefy.uazapi.com';
        const INSTANCE_NAME = config['UAZAPI_INSTANCE_NAME'] || 'sphaus';
        const SUPABASE_PROJECT_REF = 'fpqpnztwhkcrytprhyhe';

        const url = new URL(req.url);
        const action = url.searchParams.get("action");
        const phone = url.searchParams.get("phone");

        console.log(`[whatsapp-manager] Action: ${action}, BaseURL: ${UAZAPI_BASE_URL}`);

        const authHeader = { "Authorization": `Bearer ${UAZAPI_KEY || ""}` };
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
                await supabase.from('app_config').upsert({ key: 'UAZAPI_INSTANCE_TOKEN', value: createData.token });
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
            const { data } = await uazapiFetch("/instance/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(newToken ? { "apikey": newToken } : {}) },
                body: JSON.stringify(phone ? { phone } : {})
            });

            // --- AUTO WEBHOOK SETUP ---
            const webhookUrl = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/ai-concierge-v5-final`;
            console.log(`[whatsapp-manager] Auto-setting webhook: ${webhookUrl}`);
            await fetch(`${UAZAPI_BASE_URL}/webhook`, {
                method: "POST",
                headers: { "token": newToken || INSTANCE_TOKEN, "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: webhookUrl,
                    enabled: true,
                    events: ["message", "messages.upsert", "status", "connection", "chat.upsert"],
                    autoDownload: true,
                    decryptMedia: true
                })
            }).catch(e => console.error("[whatsapp-manager] Auto-webhook error:", e));

            return new Response(JSON.stringify(normalizeResponse(data)), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "status") {
            const { data } = await uazapiFetch("/instance/status", { method: "GET" });

            return new Response(JSON.stringify(normalizeResponse(data)), {
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
            const keys = [
                'WHITELIST_ENABLED',
                'WHITELIST_NUMBERS',
                'HUMAN_HANDOVER_NUMBER',
                'REJECT_CALLS',
                'IGNORE_GROUPS',
                'VIEW_STATUS',
                'AUTO_READ',
                'ALWAYS_ONLINE',
                'HISTORY_SYNC'
            ];
            const { data: settingsRows } = await supabase.from('app_config').select('key, value').in('key', keys);
            const settings = Object.fromEntries(settingsRows?.map(r => [r.key, r.value]) || []);

            return new Response(JSON.stringify({
                whitelistEnabled: settings['WHITELIST_ENABLED'] === 'true',
                whitelistNumbers: JSON.parse(settings['WHITELIST_NUMBERS'] || '[]'),
                handoverNumber: settings['HUMAN_HANDOVER_NUMBER'] || '',
                rejectCalls: settings['REJECT_CALLS'] === 'true',
                ignoreGroups: settings['IGNORE_GROUPS'] === 'true',
                viewStatus: settings['VIEW_STATUS'] === 'true',
                autoRead: settings['AUTO_READ'] === 'true',
                alwaysOnline: settings['ALWAYS_ONLINE'] === 'true',
                historySync: settings['HISTORY_SYNC'] === 'true'
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "save-settings") {
            const body = await req.json();
            const updates = [
                { key: 'WHITELIST_ENABLED', value: String(body.whitelistEnabled) },
                { key: 'WHITELIST_NUMBERS', value: JSON.stringify(body.whitelistNumbers || []) },
                { key: 'HUMAN_HANDOVER_NUMBER', value: body.handoverNumber || '' },
                { key: 'REJECT_CALLS', value: String(body.rejectCalls ?? false) },
                { key: 'IGNORE_GROUPS', value: String(body.ignoreGroups ?? false) },
                { key: 'VIEW_STATUS', value: String(body.viewStatus ?? false) },
                { key: 'AUTO_READ', value: String(body.autoRead ?? false) },
                { key: 'ALWAYS_ONLINE', value: String(body.alwaysOnline ?? false) },
                { key: 'HISTORY_SYNC', value: String(body.historySync ?? false) }
            ];

            const { error } = await supabase.from('app_config').upsert(updates, { onConflict: 'key' });

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
            await supabase.from('app_config').upsert([
                { key: 'UAZAPI_INSTANCE_STATUS', value: 'disconnected' },
                { key: 'UAZAPI_QR_CODE', value: '' },
                { key: 'UAZAPI_INSTANCE_TOKEN', value: '' }
            ]);

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
