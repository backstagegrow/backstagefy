import { createClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * GENERATE-FUNNEL v2 — AI Specialist for Funnel Generation
 *
 * Loads the FULL company dossier from knowledge_documents + agent config,
 * scores the KB quality, and generates deeply personalized funnel steps.
 * Every step MUST reference real company data — no generic templates.
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

        // ═══════════════════════════════════════════════════════
        // 1. LOAD ALL DATA SOURCES — Leave no stone unturned
        // ═══════════════════════════════════════════════════════

        // 1a. Knowledge Documents — FULL content, no truncation for small KBs
        const { data: docs, error: docsError } = await supabase
            .from('knowledge_documents')
            .select('title, content, category, extra, chunk_count')
            .eq('tenant_id', tenant_id)
            .eq('status', 'ready')
            .order('category')
            .order('created_at', { ascending: false });

        if (docsError) throw docsError;

        // 1b. Agent config — name, system_prompt (personality), settings
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('name, system_prompt, settings')
            .eq('id', agent_id)
            .single();

        if (agentError) {
            console.warn('[generate-funnel] Agent query error:', agentError.message);
        }
        console.log('[generate-funnel] Agent loaded:', agent?.name, 'System prompt length:', agent?.system_prompt?.length);

        // 1c. Tenant info — company name, settings, business data
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name, settings')
            .eq('id', tenant_id)
            .single();

        // 1d. Existing funnel steps (if any, for context)
        const { data: existingSteps } = await supabase
            .from('funnel_steps')
            .select('name, type, prompt_instructions')
            .eq('tenant_id', tenant_id)
            .eq('agent_id', agent_id)
            .order('step_order');

        // ═══════════════════════════════════════════════════════
        // 2. BUILD COMPREHENSIVE DOSSIER
        // ═══════════════════════════════════════════════════════

        const categoryLabels: Record<string, string> = {
            company_info: 'DADOS INSTITUCIONAIS DA EMPRESA',
            products: 'PRODUTOS & SERVIÇOS OFERECIDOS',
            faq: 'PERGUNTAS FREQUENTES (FAQ/SAC)',
            documents: 'DOCUMENTOS E MATERIAIS',
            media: 'MÍDIAS E RECURSOS VISUAIS',
        };

        const grouped: Record<string, string[]> = {};
        let totalContentChars = 0;
        let totalDocs = 0;

        for (const doc of (docs || [])) {
            const cat = doc.category || 'documents';
            if (!grouped[cat]) grouped[cat] = [];

            const parts: string[] = [];
            parts.push(`📄 TÍTULO: ${doc.title}`);

            if (doc.content?.trim()) {
                parts.push(`CONTEÚDO COMPLETO:\n${doc.content.trim()}`);
                totalContentChars += doc.content.length;
            }

            if (doc.extra && typeof doc.extra === 'object') {
                const extraEntries = Object.entries(doc.extra)
                    .filter(([, v]) => v && String(v).trim())
                    .map(([k, v]) => `  • ${k}: ${v}`);
                if (extraEntries.length > 0) {
                    parts.push(`METADADOS:\n${extraEntries.join('\n')}`);
                    totalContentChars += extraEntries.join('').length;
                }
            }

            grouped[cat].push(parts.join('\n'));
            totalDocs++;
        }

        // Add tenant settings as company info
        const tenantSettings = tenant?.settings as Record<string, string> | null;
        if (tenantSettings) {
            const settingsBlock = [
                tenantSettings.address ? `  • Endereço: ${tenantSettings.address}` : null,
                tenantSettings.phone ? `  • Telefone: ${tenantSettings.phone}` : null,
                tenantSettings.hours ? `  • Horário de Funcionamento: ${tenantSettings.hours}` : null,
                tenantSettings.social ? `  • Redes Sociais: ${tenantSettings.social}` : null,
                tenantSettings.website ? `  • Website: ${tenantSettings.website}` : null,
                tenantSettings.description ? `  • Sobre a empresa: ${tenantSettings.description}` : null,
            ].filter(Boolean);

            if (settingsBlock.length > 0) {
                if (!grouped['company_info']) grouped['company_info'] = [];
                grouped['company_info'].push(`📄 CADASTRO DA PLATAFORMA:\n${settingsBlock.join('\n')}`);
                totalContentChars += settingsBlock.join('').length;
            }
        }

        // Build full dossier text
        const dossierSections = Object.entries(categoryLabels).map(([key, label]) => {
            const entries = grouped[key];
            if (!entries || entries.length === 0) return `══ ${label} ══\n(Nenhum conteúdo cadastrado nesta categoria)`;
            return `══ ${label} ══\n${entries.join('\n\n---\n\n')}`;
        });

        const fullDossier = dossierSections.join('\n\n');

        // ═══════════════════════════════════════════════════════
        // 3. KB QUALITY SCORE
        // ═══════════════════════════════════════════════════════
        const filledCategories = Object.keys(grouped).length;
        const avgCharsPerDoc = totalDocs > 0 ? Math.round(totalContentChars / totalDocs) : 0;
        
        let qualityScore = 0;
        // Category coverage (0-40 points)
        qualityScore += Math.min(filledCategories * 8, 40);
        // Content depth (0-30 points) — based on avg content per doc
        qualityScore += Math.min(Math.round(avgCharsPerDoc / 50), 30);
        // Volume (0-30 points) — based on total unique docs
        qualityScore += Math.min(totalDocs * 5, 30);

        qualityScore = Math.min(qualityScore, 100);

        const qualityLabel = qualityScore >= 80 ? 'EXCELENTE' :
                           qualityScore >= 60 ? 'BOM' :
                           qualityScore >= 40 ? 'RAZOÁVEL' :
                           qualityScore >= 20 ? 'BÁSICO' : 'INSUFICIENTE';

        // ═══════════════════════════════════════════════════════
        // 4. AGENT IDENTITY BLOCK
        // ═══════════════════════════════════════════════════════
        const agentName = agent?.name || 'Assistente';
        const agentPersonality = agent?.system_prompt || '';
        const companyName = tenant?.name || 'Empresa';

        const agentBlock = `
═══ IDENTIDADE DO AGENTE ═══
Nome da IA: ${agentName}
Empresa: ${companyName}
${agentPersonality ? `Personalidade configurada: ${agentPersonality}` : ''}
${tenantSettings?.phone ? `Telefone da empresa: ${tenantSettings.phone}` : ''}
${tenantSettings?.hours ? `Horário de atendimento: ${tenantSettings.hours}` : ''}
`.trim();

        // ═══════════════════════════════════════════════════════
        // 5. BUILD EXPERT PROMPT
        // ═══════════════════════════════════════════════════════
        const systemPrompt = `Você é um ESPECIALISTA em IA conversacional e funis de vendas consultivas via WhatsApp. Sua missão é criar o funil de atendimento MAIS PERSONALIZADO POSSÍVEL para esta empresa específica.

🚨 REGRA ABSOLUTA: NENHUMA etapa pode ser genérica. CADA instrução DEVE referenciar dados reais do dossiê abaixo. Se a base tem poucas informações, EXTRAIA O MÁXIMO de cada detalhe disponível.

═══════════════════════════════════════
IDENTIDADE (OBRIGATÓRIO usar em TODAS as etapas):
- O nome da IA é: "${agentName}"
- A empresa se chama: "${companyName}"
- A IA SEMPRE deve se apresentar pelo nome "${agentName}" e dizer que trabalha na "${companyName}"
${agentPersonality ? `- Personalidade da IA: ${agentPersonality}` : ''}
${tenantSettings?.hours ? `- Horário de atendimento: ${tenantSettings.hours}` : ''}
═══════════════════════════════════════

INSTRUÇÕES DE GERAÇÃO:
1. Crie entre 5 e 7 etapas de funil
2. Cada etapa DEVE ter: name, type, step_order, prompt_instructions
3. Types permitidos: greeting, qualification, value_anchor, budget, closing, sac, custom
4. As prompt_instructions devem ser LONGAS e DETALHADAS (mínimo 200 palavras cada)
5. CADA instrução deve ser escrita como um briefing completo para a IA "${agentName}"
6. USE nomes de produtos/serviços REAIS do dossiê
7. INCORPORE FAQs reais nas etapas relevantes
8. MENCIONE endereço, telefone, horário quando apropriado
9. INCLUA exemplos de frases que "${agentName}" deve usar
10. INCLUA exemplos de objeções comuns e como ${agentName} deve respondê-las
11. O tom deve ser coerente com a personalidade configurada
12. Se a base tem pouco conteúdo, CRIE contexto inteligente a partir do que existe (ex: se tem 1 produto, crie perguntas de qualificação sobre ele)

ESTRUTURA OBRIGATÓRIA DE CADA prompt_instructions:
\`\`\`
## Objetivo Claro
[O que ${agentName} deve conquistar nesta etapa]

## Contexto da Empresa
[Dados REAIS da ${companyName} relevantes para esta etapa]

## Comportamento do ${agentName}
[Como a IA deve se comportar, tom de voz, personalidade]

## Perguntas Estratégicas
[Perguntas específicas que ${agentName} deve fazer, usando dados reais]

## Exemplos de Respostas
[Frases prontas que ${agentName} pode usar, citando produtos/serviços reais]

## Tratamento de Objeções
[Objeções comuns e como ${agentName} deve responder]

## Critério de Avanço
[Quando avançar para a próxima etapa]
\`\`\`

Responda APENAS com JSON válido:
{
  "quality_score": ${qualityScore},
  "quality_label": "${qualityLabel}",
  "steps": [
    {
      "step_order": 1,
      "name": "Nome Personalizado da Etapa",
      "type": "greeting",
      "prompt_instructions": "Instruções COMPLETAS e DETALHADAS..."
    }
  ]
}`;

        const userPrompt = `${agentBlock}

═══════════════════════════════════════════════════════
DOSSIÊ COMPLETO DA EMPRESA "${companyName}"
Qualidade da Base: ${qualityScore}/100 (${qualityLabel})
Total de documentos indexados: ${totalDocs}
Categorias preenchidas: ${filledCategories}/5
═══════════════════════════════════════════════════════

${fullDossier}

═══════════════════════════════════════════════════════
GERE AGORA o funil personalizado para "${agentName}" da "${companyName}".
LEMBRE-SE: cada etapa DEVE citar dados REAIS do dossiê acima.
Se o dossiê for pequeno, MAXIMIZE cada informação disponível.
═══════════════════════════════════════════════════════`;

        console.log(`[generate-funnel] Tenant: ${companyName}, Agent: ${agentName}, KB Score: ${qualityScore}/100, Docs: ${totalDocs}, Chars: ${totalContentChars}`);

        // ═══════════════════════════════════════════════════════
        // 6. CALL OpenAI with maximum context
        // ═══════════════════════════════════════════════════════
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
                temperature: 0.6,
                max_tokens: 8000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!openaiRes.ok) {
            const errText = await openaiRes.text();
            throw new Error(`OpenAI error: ${openaiRes.status} - ${errText}`);
        }

        const openaiData = await openaiRes.json();
        const content = openaiData.choices?.[0]?.message?.content;

        if (!content) throw new Error('Empty response from OpenAI');

        const parsed = JSON.parse(content);

        if (!parsed.steps || !Array.isArray(parsed.steps)) {
            throw new Error('Invalid response structure from AI');
        }

        // Validate and sanitize step types
        const validTypes = ['greeting', 'qualification', 'value_anchor', 'budget', 'closing', 'sac', 'custom'];
        for (const step of parsed.steps) {
            if (!validTypes.includes(step.type)) step.type = 'custom';
        }

        console.log(`[generate-funnel] Generated ${parsed.steps.length} steps for ${companyName}`);

        return new Response(
            JSON.stringify({
                steps: parsed.steps,
                quality_score: qualityScore,
                quality_label: qualityLabel,
                agent_name: agentName,
                company_name: companyName,
                docs_count: totalDocs,
                categories_filled: filledCategories,
            }),
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
