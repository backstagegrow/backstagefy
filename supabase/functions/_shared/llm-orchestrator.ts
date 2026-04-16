export interface LLMMessage {
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: any[];
    name?: string;
}

export interface LLMTool {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: any;
    };
}

export interface OrchestratorResult {
    success: boolean;
    error?: string;
    responseMessage?: any;
    toolCalls?: any[];
    finalReply?: string;
    provider?: string;
}

/**
 * Agnostic LLM Orchestrator with fallback support.
 */
export async function callLLMWithFallback(
    agentModel: string,
    agentTemp: number,
    messages: LLMMessage[],
    tools: LLMTool[],
    openAiKey: string,
    googleApiKey?: string
): Promise<OrchestratorResult> {
    // --- 1. PREFER GOOGLE GEMINI ---
    if (googleApiKey) {
        try {
            console.log(`[Orchestrator] Attempting primary provider (Gemini)`);

            // Format messages for Gemini
            // system instructions are separate in Gemini API
            const systemMsg = messages.find(m => m.role === 'system');
            const userHistory = messages.filter(m => m.role !== 'system');

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemMsg?.content || "Você é um assistente prestativo." }] },
                    contents: userHistory.map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    })),
                    tools: [{ function_declarations: tools.map(t => t.function) }],
                    generationConfig: {
                        temperature: agentTemp,
                        maxOutputTokens: 1000
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const candidate = data.candidates?.[0];
                const content = candidate?.content;
                const parts = content?.parts || [];

                let text = "";
                let toolCalls: any[] = [];

                for (const part of parts) {
                    if (part.text) text += part.text;
                    if (part.functionCall) {
                        toolCalls.push({
                            id: `gem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            type: 'function',
                            function: {
                                name: part.functionCall.name,
                                arguments: JSON.stringify(part.functionCall.args)
                            }
                        });
                    }
                }

                return {
                    success: true,
                    finalReply: text,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    provider: "gemini"
                };
            } else {
                const errTxt = await response.text();
                console.error(`[Orchestrator] Gemini API Error: ${response.status}`, errTxt);
            }
        } catch (gemErr: any) {
            console.error(`[Orchestrator] Gemini Exception:`, gemErr.message);
        }
    }

    // --- 2. FALLBACK TO OPENAI ---
    try {
        console.log(`[Orchestrator] Using OpenAI (Fallback) with model ${agentModel}`);

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openAiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: agentModel || "gpt-4o-mini",
                messages,
                tools,
                tool_choice: "auto",
                temperature: agentTemp
            })
        });

        if (!aiRes.ok) {
            const errBody = await aiRes.text();
            throw new Error(`OpenAI HTTP Error: ${aiRes.status} - ${errBody}`);
        }

        const aiData = await aiRes.json();
        const responseMessage = aiData?.choices?.[0]?.message;
        const toolCalls = responseMessage?.tool_calls;
        const finalReply = responseMessage?.content || "";

        return {
            success: true,
            responseMessage,
            toolCalls,
            finalReply,
            provider: "openai"
        };
    } catch (error: any) {
        console.error("[Orchestrator] All LLM providers failed:", error.message);
        return { success: false, error: error.message };
    }
}
