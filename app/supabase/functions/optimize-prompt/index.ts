import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { prompt, stepName, stepType } = await req.json();

        if (!prompt || prompt.trim().length < 10) {
            return new Response(
                JSON.stringify({ error: "Prompt muito curto. Escreva pelo menos 10 caracteres para otimizar." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
        if (!OPENAI_KEY) {
            return new Response(
                JSON.stringify({ error: "Chave da OpenAI não configurada no servidor." }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const stepTypeLabels: Record<string, string> = {
            greeting: "Boas-vindas / Abertura",
            qualification: "Qualificação de Lead",
            value_anchor: "Ancoragem de Valor",
            budget: "Investigação de Investimento",
            closing: "Fechamento / Conversão",
            sac: "Pós-venda / SAC",
            custom: "Etapa Personalizada",
        };

        const typeLabel = stepTypeLabels[stepType] || "Etapa Personalizada";

        const systemPrompt = `Você é um engenheiro de prompts especialista em funis de atendimento automatizados com IA.

Sua missão é transformar instruções brutas e informais em um prompt profissional, estruturado e de alta performance para um assistente de IA que conversa via WhatsApp.

CONTEXTO DO FUNIL:
- Nome da Etapa: "${stepName}"
- Tipo da Etapa: "${typeLabel}"

REGRAS DE OTIMIZAÇÃO:
1. OBJETIVO CLARO: Defina em 1 frase o que a IA deve alcançar nesta etapa.
2. CONTEXTO: Explique brevemente onde esta etapa se encaixa no funil.
3. COMPORTAMENTO: Tom de voz, ritmo, estilo de comunicação.
4. PERGUNTAS ESTRATÉGICAS: Liste as perguntas que a IA deve fazer (numeradas, máximo 5).
5. CRITÉRIO DE AVANÇO: Defina quando a IA pode passar para a próxima etapa.
6. REGRAS: Restrições e guardrails (ex: nunca inventar dados, nunca prometer descontos, etc.).
7. FORMATAÇÃO: Use markdown simples e seções com ## para organizar.

NÃO adicione:
- Instruções genéricas ("seja educado", "responda rápido")
- Seções vazias ou placeholders
- Texto excessivamente longo (máximo ~400 palavras)

RESPONDA APENAS com o prompt otimizado, sem explicações adicionais.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Prompt original do usuário:\n\n${prompt}` },
                ],
                temperature: 0.4,
                max_tokens: 1200,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenAI API Error:", errText);
            return new Response(
                JSON.stringify({ error: "Erro na API da OpenAI. Tente novamente." }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();
        const optimized = data.choices?.[0]?.message?.content?.trim();

        if (!optimized) {
            return new Response(
                JSON.stringify({ error: "A IA não retornou uma resposta válida." }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({
                optimized,
                model: "gpt-4o",
                tokens: data.usage?.total_tokens || 0,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("optimize-prompt error:", err);
        return new Response(
            JSON.stringify({ error: err.message || "Erro interno do servidor." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
