/**
 * AIOS V7 - E2E Simulation Script
 * Simulates a UAZAPI Webhook payload against a local or remote Edge Function.
 */

const FUNCTION_URL = "http://localhost:54321/functions/v1/ai-concierge-v7"; // Change to remote URL if needed
const SERVICE_ROLE_KEY = "YOUR_SUPABASE_SERVICE_ROLE_KEY"; // Set env var logically

async function simulateWebhook(messageText: string, fromPhone: string, instanceName: string) {
    console.log(`🚀 Simulating message: "${messageText}" from ${fromPhone} to instance ${instanceName}`);

    const payload = {
        instance: instanceName,
        message: {
            key: {
                remoteJid: `${fromPhone}@s.whatsapp.net`,
                fromMe: false,
                id: `SIM_${Date.now()}`
            },
            text: messageText,
            messageTimestamp: Math.floor(Date.now() / 1000)
        }
    };

    try {
        const res = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const result = await res.text();
        console.log(`✅ Response [${res.status}]:`, result);
    } catch (e: any) {
        console.error(`❌ Simulation Failed:`, e.message);
    }
}

// --- TEST CASES ---
(async () => {
    // 1. Standard Greeting
    await simulateWebhook("Olá, gostaria de saber os preços", "5511999999999", "bsf_04a07217");

    // 2. LID Fallback Simulation
    console.log("\n--- Testing LID Fallback ---");
    const lidPayload = {
        instance: "bsf_04a07217",
        sender_pn: "5511888888888@s.whatsapp.net",
        message: {
            key: { remoteJid: "12345678@lid", fromMe: false, id: "SIM_LID" },
            text: "Oi, sou um usuário com LID"
        }
    };
    // Fetch call for LID manually or wrap in func...

    // 3. Tool Call Trigger (Requires Lead to be in specific state or Prompt to encourage it)
    await simulateWebhook("Quero agendar uma conversa para amanhã as 10h", "5511999999999", "bsf_04a07217");
})();
