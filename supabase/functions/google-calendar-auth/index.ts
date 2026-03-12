import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://backstagefy.com.br";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type, x-user-token",
};

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// Extracts user JWT from x-user-token header (frontend passes anon key as Authorization for Kong)
function getUserToken(req: Request): string | null {
  return req.headers.get("x-user-token") ?? req.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (action === "connect") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    const state = btoa(JSON.stringify({ userId: user.id, ts: Date.now() }));
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    return Response.json({ url: authUrl.toString() }, { headers: CORS });
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error || !code || !state) return Response.redirect(`${APP_URL}/?gcal=error`);
    let userId: string;
    try {
      const decoded = JSON.parse(atob(state));
      userId = decoded.userId;
      if (Date.now() - decoded.ts > 10 * 60 * 1000) throw new Error("expired");
    } catch { return Response.redirect(`${APP_URL}/?gcal=error`); }
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) return Response.redirect(`${APP_URL}/?gcal=error`);
    const tokens = await tokenRes.json();
    let googleEmail = "";
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (ui.ok) { const d = await ui.json(); googleEmail = d.email ?? ""; }
    } catch {}
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", userId).single();
    if (!tenant) return Response.redirect(`${APP_URL}/?gcal=error`);
    const expiryDate = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
    await supabase.from("google_calendar_tokens").upsert({
      tenant_id: tenant.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: expiryDate,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

    // Envia postMessage para a janela pai e fecha o popup
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  try {
    window.opener?.postMessage({ gcal: 'success' }, '*');
  } catch(e) {}
  window.close();
</script>
<p style="font-family:sans-serif;text-align:center;padding:40px;color:#333">
  Conectado! Fechando...
</p>
</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (action === "disconnect") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", user.id).single();
    if (tenant) await supabase.from("google_calendar_tokens").delete().eq("tenant_id", tenant.id);
    return Response.json({ success: true }, { headers: CORS });
  }

  if (action === "status") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ connected: false }, { headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ connected: false }, { headers: CORS });
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", user.id).single();
    if (!tenant) return Response.json({ connected: false }, { headers: CORS });
    const { data: tokenRecord } = await supabase.from("google_calendar_tokens").select("google_email, updated_at").eq("tenant_id", tenant.id).maybeSingle();
    return Response.json({ connected: !!tokenRecord, google_email: tokenRecord?.google_email ?? null, connected_at: tokenRecord?.updated_at ?? null }, { headers: CORS });
  }

  return Response.json({ error: "Invalid action" }, { status: 400, headers: CORS });
});
