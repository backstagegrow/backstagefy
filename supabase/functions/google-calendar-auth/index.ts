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
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

async function getValidToken(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<string> {
  const { data: rec } = await supabase.from("google_calendar_tokens").select("*").eq("tenant_id", tenantId).single();
  if (!rec) throw new Error("No token");
  const isExpired = rec.expiry_date && Date.now() > rec.expiry_date - 5 * 60 * 1000;
  if (!isExpired) return rec.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: rec.refresh_token, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
  });
  if (!r.ok) throw new Error("Refresh failed");
  const d = await r.json();
  await supabase.from("google_calendar_tokens").update({ access_token: d.access_token, expiry_date: Date.now() + d.expires_in * 1000, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  return d.access_token;
}

// verify_jwt=false: Kong passes the request through. We validate manually.
function getUserToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  return auth?.replace(/^Bearer\s+/i, "") ?? null;
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

    // Redireciona para página estática no app que envia postMessage e fecha o popup
    return Response.redirect(`${APP_URL}/gcal-success.html`, 302);
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
    const { data: tokenRecord } = await supabase.from("google_calendar_tokens").select("google_email, updated_at, calendar_id").eq("tenant_id", tenant.id).maybeSingle();
    return Response.json({ connected: !!tokenRecord, google_email: tokenRecord?.google_email ?? null, connected_at: tokenRecord?.updated_at ?? null, calendar_id: tokenRecord?.calendar_id ?? "primary" }, { headers: CORS });
  }

  if (action === "list-calendars") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", user.id).single();
    if (!tenant) return Response.json({ error: "No tenant" }, { status: 404, headers: CORS });
    const accessToken = await getValidToken(supabase, tenant.id);
    const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!calRes.ok) return Response.json({ error: "Failed to list calendars" }, { status: 502, headers: CORS });
    const calData = await calRes.json();
    const calendars = (calData.items ?? []).map((c: Record<string, string>) => ({ id: c.id, summary: c.summary, primary: !!c.primary, backgroundColor: c.backgroundColor }));
    return Response.json({ calendars }, { headers: CORS });
  }

  if (action === "select-calendar") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", user.id).single();
    if (!tenant) return Response.json({ error: "No tenant" }, { status: 404, headers: CORS });
    const body = await req.json().catch(() => ({}));
    const calendarId = body.calendar_id;
    if (!calendarId) return Response.json({ error: "Missing calendar_id" }, { status: 400, headers: CORS });
    await supabase.from("google_calendar_tokens").update({ calendar_id: calendarId, updated_at: new Date().toISOString() }).eq("tenant_id", tenant.id);
    return Response.json({ success: true, calendar_id: calendarId }, { headers: CORS });
  }

  if (action === "create-event") {
    const userToken = getUserToken(req);
    if (!userToken) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });
    const { data: { user }, error } = await supabase.auth.getUser(userToken);
    if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    const { data: tenant } = await supabase.from("tenants").select("id, name").eq("owner_id", user.id).single();
    if (!tenant) return Response.json({ error: "No tenant" }, { status: 404, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const { summary, description, start_time, end_time, appointment_type, attendee_email } = body;
    if (!summary || !start_time || !end_time) return Response.json({ error: "Missing fields" }, { status: 400, headers: CORS });

    const accessToken = await getValidToken(supabase, tenant.id);
    const { data: tokenRec } = await supabase.from("google_calendar_tokens").select("calendar_id").eq("tenant_id", tenant.id).single();
    const calendarId = tokenRec?.calendar_id || "primary";

    // Build event body
    const eventBody: Record<string, unknown> = {
      summary,
      description: description || "",
      start: { dateTime: start_time, timeZone: "America/Sao_Paulo" },
      end: { dateTime: end_time, timeZone: "America/Sao_Paulo" },
    };

    // Add attendee if email provided
    if (attendee_email) {
      eventBody.attendees = [{ email: attendee_email }];
    }

    // For online appointments, request Google Meet link
    if (appointment_type === "online") {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${appointment_type === "online" ? "?conferenceDataVersion=1" : ""}`;
    const calRes = await fetch(calUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error("GCal create-event error:", errText);
      return Response.json({ error: "Failed to create event", details: errText }, { status: 502, headers: CORS });
    }

    const event = await calRes.json();
    const meetLink = event.conferenceData?.entryPoints?.find((e: Record<string, string>) => e.entryPointType === "video")?.uri || null;

    return Response.json({
      success: true,
      event_id: event.id,
      html_link: event.htmlLink,
      meet_link: meetLink,
    }, { headers: CORS });
  }

  return Response.json({ error: "Invalid action" }, { status: 400, headers: CORS });
});
