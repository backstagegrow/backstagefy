import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://backstagefy.com.br";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ─── CONNECT: gera URL OAuth e redireciona ───────────────────────────────
  if (action === "connect") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Encoda o user_id no state para recuperar no callback
    const state = btoa(JSON.stringify({ userId: user.id, ts: Date.now() }));

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return Response.json({ url: authUrl.toString() });
  }

  // ─── CALLBACK: troca code por tokens e salva no banco ────────────────────
  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return Response.redirect(`${APP_URL}/?tab=viewings&gcal=error`);
    }

    let userId: string;
    try {
      const decoded = JSON.parse(atob(state));
      userId = decoded.userId;
      // Rejeita states com mais de 10 minutos
      if (Date.now() - decoded.ts > 10 * 60 * 1000) throw new Error("expired");
    } catch {
      return Response.redirect(`${APP_URL}/?tab=viewings&gcal=error`);
    }

    // Troca code por tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return Response.redirect(`${APP_URL}/?tab=viewings&gcal=error`);
    }

    const tokens = await tokenRes.json();

    // Busca email do usuário Google
    let googleEmail = "";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        googleEmail = userInfo.email ?? "";
      }
    } catch { /* ignore */ }

    // Busca tenant_id do usuário
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!tenant) {
      return Response.redirect(`${APP_URL}/?tab=viewings&gcal=error`);
    }

    // Salva/atualiza tokens
    const expiryDate = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null;

    await supabase.from("google_calendar_tokens").upsert({
      tenant_id: tenant.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: expiryDate,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

    return Response.redirect(`${APP_URL}/?tab=viewings&gcal=success`);
  }

  // ─── DISCONNECT: remove token do banco ───────────────────────────────────
  if (action === "disconnect") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (tenant) {
      await supabase.from("google_calendar_tokens").delete().eq("tenant_id", tenant.id);
    }

    return Response.json({ success: true });
  }

  // ─── STATUS: verifica se conectado ───────────────────────────────────────
  if (action === "status") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!tenant) return Response.json({ connected: false });

    const { data: tokenRecord } = await supabase
      .from("google_calendar_tokens")
      .select("google_email, updated_at")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    return Response.json({
      connected: !!tokenRecord,
      google_email: tokenRecord?.google_email ?? null,
      connected_at: tokenRecord?.updated_at ?? null,
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
});
