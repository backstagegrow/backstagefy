import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("[CartRecovery] Starting scan...");

    // ===== STEP 1: Get tenants with cart recovery enabled =====
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, cart_recovery_enabled, cart_recovery_max_attempts, cart_recovery_cooldown_minutes")
      .eq("cart_recovery_enabled", true);

    if (!tenants || tenants.length === 0) {
      console.log("[CartRecovery] No tenants with recovery enabled");
      return new Response(JSON.stringify({ processed: 0, reason: "no_tenants_enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    let totalSent = 0;

    for (const tenant of tenants) {
      const maxAttempts = tenant.cart_recovery_max_attempts || 3;
      const cooldownMinutes = tenant.cart_recovery_cooldown_minutes || 30;

      // ===== STEP 2: Check BRT business hours (8h-22h) =====
      const nowBRT = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
      );
      const currentHour = nowBRT.getHours();

      if (currentHour < 8 || currentHour >= 22) {
        console.log(`[CartRecovery] Outside BRT hours (${currentHour}h) for tenant ${tenant.id}`);
        continue;
      }

      // ===== STEP 3: Find abandoned sales ready for recovery =====
      const { data: abandonedSales } = await supabase
        .from("platform_sales")
        .select(`
          id, buyer_name, buyer_email, buyer_phone, amount, ticket_type, platform, sold_at,
          event:event_id (id, name, event_type, event_date, location)
        `)
        .eq("tenant_id", tenant.id)
        .eq("status", "abandoned")
        .not("buyer_phone", "is", null);

      if (!abandonedSales || abandonedSales.length === 0) {
        console.log(`[CartRecovery] No abandoned sales for tenant ${tenant.id}`);
        continue;
      }

      // ===== STEP 4: Filter by recovery eligibility =====
      for (const sale of abandonedSales) {
        totalProcessed++;

        // Check existing recovery attempts
        const { data: existingLogs } = await supabase
          .from("cart_recovery_logs")
          .select("attempt, sent_at, status")
          .eq("sale_id", sale.id)
          .order("attempt", { ascending: false })
          .limit(1);

        const lastAttempt = existingLogs?.[0];
        const attemptCount = lastAttempt?.attempt || 0;

        // Already converted or max attempts reached
        if (lastAttempt?.status === "converted" || attemptCount >= maxAttempts) {
          continue;
        }

        // Cooldown check
        if (lastAttempt?.sent_at) {
          const lastSentAt = new Date(lastAttempt.sent_at);
          const minutesSinceLast = (Date.now() - lastSentAt.getTime()) / 60000;
          if (minutesSinceLast < cooldownMinutes) {
            continue;
          }
        }

        // First attempt requires minimum 5 min after abandonment
        if (attemptCount === 0 && sale.sold_at) {
          const abandonedAt = new Date(sale.sold_at);
          const minutesSinceAbandon = (Date.now() - abandonedAt.getTime()) / 60000;
          if (minutesSinceAbandon < 5) {
            continue;
          }
        }

        const nextAttempt = attemptCount + 1;

        // ===== STEP 5: Get tenant knowledge base context =====
        let knowledgeContext = "";
        try {
          const { data: kbItems } = await supabase
            .from("knowledge_base")
            .select("title, content")
            .eq("tenant_id", tenant.id)
            .eq("category", "dados_institucionais")
            .limit(2);

          if (kbItems && kbItems.length > 0) {
            knowledgeContext = kbItems.map((k: any) => `${k.title}: ${k.content?.substring(0, 200)}`).join("\n");
          }
        } catch {
          // KB is optional
        }

        // ===== STEP 6: Generate AI recovery message =====
        const event = sale.event as any;
        const attemptStrategy: Record<number, string> = {
          1: "Mensagem SUAVE e curiosa. Diga que notou o pedido pendente. Desperte curiosidade sem pressionar. Tom amigável.",
          2: "Mensagem de VALOR. Destaque o benefício principal do produto/evento. Leve senso de urgência. Mostre o que a pessoa está perdendo.",
          3: "ÚLTIMA CHANCE. Escassez real. Diga que é a última vez que vai falar sobre isso. Ofereça ajuda direta caso tenha alguma dúvida.",
        };

        const aiPrompt = `Você é um especialista em recuperação de vendas via WhatsApp.

CONTEXTO DO ABANDONO:
- Produto/Evento: ${event?.name || "Produto"}
- Preço: R$ ${sale.amount?.toFixed(2)}
- Tipo: ${event?.event_type || "produto"} (curso/evento/produto/assinatura)
- Data do evento: ${event?.event_date || "Sem data específica"}
- Local: ${event?.location || "Online"}
- Nome do comprador: ${sale.buyer_name || "Cliente"}
- Plataforma: ${sale.platform}
- Tentativa: ${nextAttempt} de ${maxAttempts}

${knowledgeContext ? `SOBRE A EMPRESA:\n${knowledgeContext}` : ""}

ESTRATÉGIA PARA TENTATIVA ${nextAttempt}:
${attemptStrategy[nextAttempt] || attemptStrategy[3]}

REGRAS OBRIGATÓRIAS:
1. Máximo 3 linhas curtas (estilo WhatsApp)
2. Use o nome "${sale.buyer_name || ""}". Se vazio, não use nome.
3. NUNCA diga "abandono de carrinho" ou "carrinho abandonado"
4. Use 1-2 emojis no máximo
5. Seja natural, como um humano mandando mensagem
6. NÃO inclua links (o sistema adiciona depois)
7. Responda APENAS com a mensagem, sem explicações

Gere a mensagem:`;

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: aiPrompt }],
            temperature: 0.8,
            max_tokens: 150,
          }),
        });

        const aiData = await aiRes.json();
        const recoveryMessage = aiData?.choices?.[0]?.message?.content?.trim();

        if (!recoveryMessage) {
          console.error(`[CartRecovery] AI failed for sale ${sale.id}`);
          continue;
        }

        console.log(`[CartRecovery] Generated msg #${nextAttempt} for ${sale.buyer_name}: ${recoveryMessage}`);

        // ===== STEP 7: Send via Uazapi (WhatsApp) =====
        const { data: configs } = await supabase.from("app_config").select("key, value");
        const config = Object.fromEntries(configs?.map((r: any) => [r.key, r.value]) || []);

        // Get Uazapi credentials
        const { data: waInstance } = await supabase
          .from("whatsapp_instances")
          .select("apikey")
          .eq("tenant_id", tenant.id)
          .limit(1)
          .single();

        const UAZ_KEY = waInstance?.apikey || config["UAZAPI_INSTANCE_TOKEN"] || config["UAZAPI_KEY"];
        const UAZ_BASE = (config["UAZAPI_BASE_URL"] || "https://backstagefy.uazapi.com").replace(/\/$/, "");

        if (!UAZ_KEY) {
          console.error(`[CartRecovery] No Uazapi key for tenant ${tenant.id}`);
          continue;
        }

        const buyerPhone = sale.buyer_phone.replace(/\D/g, "");
        const remoteJid = `${buyerPhone}@s.whatsapp.net`;

        // Presence simulation
        try {
          await fetch(`${UAZ_BASE}/send/presence`, {
            method: "POST",
            headers: { token: UAZ_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ number: remoteJid, presence: "composing" }),
          });
          await new Promise((r) => setTimeout(r, 2000));
        } catch {
          // presence is optional
        }

        // Send the recovery message
        const sendRes = await fetch(`${UAZ_BASE}/send/text`, {
          method: "POST",
          headers: { token: UAZ_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            number: remoteJid,
            text: recoveryMessage,
          }),
        });

        const sendData = await sendRes.json();
        const sendSuccess = sendRes.ok;

        // ===== STEP 8: Log recovery attempt =====
        await supabase.from("cart_recovery_logs").insert({
          sale_id: sale.id,
          tenant_id: tenant.id,
          attempt: nextAttempt,
          message_sent: recoveryMessage,
          channel: "whatsapp",
          status: sendSuccess ? "sent" : "failed",
        });

        // Notify admin about recovery attempt
        const adminNumber = config["HUMAN_HANDOVER_NUMBER"] || "5519981374216";
        try {
          await fetch(`${UAZ_BASE}/send/text`, {
            method: "POST",
            headers: { token: UAZ_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              number: `${adminNumber}@s.whatsapp.net`,
              text: `🛒 *Recuperação de Carrinho* (Tentativa ${nextAttempt}/${maxAttempts})\n📦 ${event?.name || "Produto"}\n👤 ${sale.buyer_name || "Anônimo"}\n💰 R$ ${sale.amount?.toFixed(2)}\n\n💬 _"${recoveryMessage}"_`,
            }),
          });
        } catch {
          // admin notification is optional
        }

        totalSent++;

        // Log to debug
        await supabase.from("debug_logs").insert({
          step: "cart_recovery_sent",
          data: {
            sale_id: sale.id,
            attempt: nextAttempt,
            buyer: sale.buyer_name,
            product: event?.name,
            message_length: recoveryMessage.length,
          },
        });

        console.log(`[CartRecovery] ✅ Sent attempt #${nextAttempt} to ${sale.buyer_name} for ${event?.name}`);
      }
    }

    console.log(`[CartRecovery] Done. Processed: ${totalProcessed}, Sent: ${totalSent}`);

    return new Response(
      JSON.stringify({ processed: totalProcessed, sent: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[CartRecovery] Fatal Error:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
