import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SyncPayload {
  appointment_id: string;
  action: "create" | "update" | "delete";
  tenant_id: string;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expiry_date: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const data = await res.json();
  return {
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function getValidAccessToken(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<string> {
  const { data: tokenRecord } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRecord) throw new Error("No Google Calendar token for this tenant");

  // Verifica se o token ainda é válido (com margem de 5 min)
  const isExpired = tokenRecord.expiry_date && Date.now() > tokenRecord.expiry_date - 5 * 60 * 1000;

  if (!isExpired) return tokenRecord.access_token;

  // Faz refresh
  const refreshed = await refreshAccessToken(tokenRecord.refresh_token);

  await supabase.from("google_calendar_tokens").update({
    access_token: refreshed.access_token,
    expiry_date: refreshed.expiry_date,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", tenantId);

  return refreshed.access_token;
}

function buildGoogleEvent(appointment: Record<string, unknown>, lead: Record<string, unknown> | null) {
  const startDate = new Date(appointment.appointment_date as string);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1h por padrão

  const leadName = (lead?.name as string) || (lead?.company_name as string) || "Cliente BackStageFy";
  const isOnline = appointment.appointment_type === "online";

  return {
    summary: `${isOnline ? "🖥️ Online" : "🏢 Presencial"} — ${leadName}`,
    description: [
      `Tipo: ${isOnline ? "Reunião Online" : "Visita Presencial"}`,
      lead?.phone ? `WhatsApp: https://wa.me/${String(lead.phone).replace(/\D/g, "")}` : null,
      lead?.corporate_email ? `Email: ${lead.corporate_email}` : null,
      appointment.notes ? `\nNota: ${appointment.notes}` : null,
    ].filter(Boolean).join("\n"),
    location: (appointment.location_address as string) || undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let payload: SyncPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { appointment_id, action, tenant_id } = payload;
  if (!appointment_id || !action || !tenant_id) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verifica se o tenant tem integração Google Calendar
  const { data: tokenRecord } = await supabase
    .from("google_calendar_tokens")
    .select("tenant_id")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (!tokenRecord) {
    // Sem integração — não é erro, apenas não sincroniza
    return Response.json({ skipped: true, reason: "No Google Calendar integration" });
  }

  // Handle DELETE
  if (action === "delete") {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("google_event_id")
      .eq("id", appointment_id)
      .single();

    if (!appointment?.google_event_id) {
      return Response.json({ skipped: true, reason: "No Google event ID to delete" });
    }

    const accessToken = await getValidAccessToken(supabase, tenant_id);
    const deleteRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appointment.google_event_id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!deleteRes.ok && deleteRes.status !== 410) {
      console.error("Delete event failed:", await deleteRes.text());
    }

    await supabase.from("appointments").update({ google_event_id: null }).eq("id", appointment_id);
    return Response.json({ success: true });
  }

  // Busca appointment + lead
  const { data: appointment, error: appError } = await supabase
    .from("appointments")
    .select("*, leads(name, phone, company_name, corporate_email)")
    .eq("id", appointment_id)
    .single();

  if (appError || !appointment) {
    return Response.json({ error: "Appointment not found" }, { status: 404 });
  }

  const accessToken = await getValidAccessToken(supabase, tenant_id);
  const eventBody = buildGoogleEvent(appointment, appointment.leads);

  let googleEventId = appointment.google_event_id;

  if (action === "create" || !googleEventId) {
    // Cria novo evento
    const createRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Create event failed:", err);
      return Response.json({ error: err }, { status: 500 });
    }

    const created = await createRes.json();
    googleEventId = created.id;
  } else {
    // Atualiza evento existente
    const updateRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}?sendUpdates=all`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      // Se o evento não existe mais no Google, cria um novo
      if (updateRes.status === 404) {
        const createRes = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventBody),
          }
        );
        if (createRes.ok) {
          const created = await createRes.json();
          googleEventId = created.id;
        }
      } else {
        console.error("Update event failed:", err);
        return Response.json({ error: err }, { status: 500 });
      }
    }
  }

  // Salva google_event_id no appointment
  await supabase
    .from("appointments")
    .update({ google_event_id: googleEventId })
    .eq("id", appointment_id);

  return Response.json({ success: true, google_event_id: googleEventId });
});
