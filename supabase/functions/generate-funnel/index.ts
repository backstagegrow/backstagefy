import { createClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * GENERATE-FUNNEL — AI-powered funnel generation from Knowledge Base
 *
 * Reads all indexed knowledge_documents for a tenant,
 * groups by category, and generates personalized funnel steps via OpenAI.
 */
Deno.serve(async (req) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Content-Type": "application/json",
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { tenant_id, agent_id } = await req.json();

        if (!tenant_id || !agent_id) {
            return new Response(
                JSON.stringify({ error: "tenant_id and agent_id are required" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // ── 1. Load all indexed knowledge docs ──
        const { data: docs, error: docsError } = await supabase
            .from('knowledge_documents')
            .select('title, content, category, extra')
            .eq('tenant_id', tenant_id)
            .eq('status', 'ready')
            .order('category')
            .order('created_at', { ascending: false });

        if (docsError) throw docsError;
        if (!docs || docs.length === 0) {
            return new Response(
                JSON.stringify({ error: "Nenhum documento indexado encontrado na Base de Conhecimento" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // ── 2. Load tenant info ──
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name, settings')
            .eq('id', tenant_id)
            .single();

        // ── 3. Group content by category ──
        const categoryLabels: Record<string, string> = {
            company_info: 'DADOS INSTITUCIONAIS',
            products: 'PRODUTOS & SERVIÇOS',
            faq: 'FAQ / SAC',
            documents: 'DOCUMENTOS',
            media: 'MÍDIAS',
        };

        const MAX_CHARS_PER_CATEGORY = 6000;
        const grouped: Record<string, string> = {};

        for (const doc of docs) {
            const cat = doc.category || 'documents';
            const entry = `### ${doc.title}\n${doc.content || ''}\n${
                doc.extra ? Object.entries(doc.extra)
                    .filter(([, v]) => v)
                    .map(([k, v]) => `- ${k}: ${v}`)
                    .join('\n') : ''
            }\n`;

            if (!grouped[cat]) grouped[cat] = '';
            if (grouped[cat].length + entry.length <= MAX_CHARS_PER_CATEGORY) {
                grouped[cat] += entry;
            }
        }

        // Add tenant settings as company info supplement
        if (tenant?.settings) {
            const s = tenant.settings as Record<string, string>;
            const supplement = [
                s.address ? `Endereço: ${s.address}` : '',
                s.phone ? `Telefone: ${s.phone}` : '',
                s.hours ? `Horário: ${s.hours}` : '',
                s.social ? `Redes Sociais: ${s.social}` : '',
                s.website ? `Website: ${s.website}` : '',
                s.description ? `Descrição: ${s.description}` : '',
            ].filter(Boolean).join('\n');

            if (supplement) {
                grouped['company_info'] = (grouped['company_info'] || '') + `\n### Dados do Cadastro\n${supplement}\n`;
            }
        }

        const contextBlock = Object.entries(categoryLabels)
            .map(([key, label]) => `[${label}]:\n${grouped[key] || '(vazio)'}`)
            .join('\n\n');

        // ── 4. Build prompt and call OpenAI ──
        const systemPrompt = `Você é um especialista em funis de atendimento consultivo via WhatsApp.
Com base no dossiê completo da empresa abaixo, crie um funil de atendimento personalizado.

REGRAS:
- Crie entre 5 e 7 etapas
- Cada etapa deve ter: name (nome), type (tipo), prompt_instructions (instruções detalhadas para a IA)
- Os types permitidos são: greeting, qualification, value_anchor, budget, closing, sac, custom
- As instruções devem ser específicas para o negócio usando dados REAIS da empresa
- Escreva as instruções como se estivesse falando diretamente com a IA que vai atender os leads
- Use o tom e vocabulário apropriado para o segmento da empresa
- Inclua exemplos de perguntas, objeções e respostas usando produtos/serviços reais
- Se houver FAQ, incorpore perguntas frequentes nas etapas relevantes

Responda APENAS com JSON válido no formato:
{
  "steps": [
    {
      "step_order": 1,
      "name": "Nome da Etapa",
      "type": "greeting",
      "prompt_instructions": "Instruções detalhadas..."
    }
  ]
}`;

        const userPrompt = `DOSSIÊ DA EMPRESA: ${tenant?.name || 'Empresa'}\n\n${contextBlock}`;

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!openaiRes.ok) {
            const errText = await openaiRes.text();
            throw new Error(`OpenAI error: ${openaiRes.status} - ${errText}`);
        }

        const openaiData = await openaiRes.json();
        const content = openaiData.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('Empty response from OpenAI');
        }

        const parsed = JSON.parse(content);

        if (!parsed.steps || !Array.isArray(parsed.steps)) {
            throw new Error('Invalid response structure from AI');
        }

        // Validate step types
        const validTypes = ['greeting', 'qualification', 'value_anchor', 'budget', 'closing', 'sac', 'custom'];
        for (const step of parsed.steps) {
            if (!validTypes.includes(step.type)) {
                step.type = 'custom';
            }
        }

        return new Response(
            JSON.stringify({ steps: parsed.steps }),
            { headers: corsHeaders }
        );

    } catch (err: any) {
        console.error('[generate-funnel] Error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Internal error' }),
            { status: 500, headers: corsHeaders }
        );
    }
});
