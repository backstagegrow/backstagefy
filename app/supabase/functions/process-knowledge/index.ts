import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { documentId } = await req.json();
        if (!documentId) {
            return new Response(
                JSON.stringify({ error: "documentId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        if (!OPENAI_KEY) {
            return new Response(
                JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // 1. Fetch document
        const { data: doc, error: docErr } = await supabase
            .from("knowledge_documents")
            .select("*")
            .eq("id", documentId)
            .single();

        if (docErr || !doc) {
            return new Response(
                JSON.stringify({ error: "Document not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Mark as processing
        await supabase.from("knowledge_documents").update({ status: "processing" }).eq("id", documentId);

        // 2. Extract text content
        let textContent = "";

        if (doc.content) {
            // Text-based content (FAQ, company info, products, text entries)
            textContent = doc.content;

            // Append extra fields as structured text
            if (doc.extra && typeof doc.extra === "object") {
                const extraLines = Object.entries(doc.extra)
                    .filter(([_, v]) => v)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n");
                if (extraLines) {
                    textContent += `\n\n--- Informacoes Adicionais ---\n${extraLines}`;
                }
            }
        } else if (doc.storage_path) {
            // File-based content: download and extract text
            const { data: fileData, error: fileErr } = await supabase.storage
                .from("knowledge-files")
                .download(doc.storage_path);

            if (fileErr || !fileData) {
                await supabase.from("knowledge_documents").update({ status: "error" }).eq("id", documentId);
                return new Response(
                    JSON.stringify({ error: "Failed to download file" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Extract text based on mime type
            if (doc.mime_type?.includes("text") || doc.original_filename?.endsWith(".txt") || doc.original_filename?.endsWith(".csv")) {
                textContent = await fileData.text();
            } else if (doc.mime_type?.includes("pdf") || doc.original_filename?.endsWith(".pdf")) {
                // For PDFs, extract raw text (basic approach)
                const rawText = await fileData.text();
                // Simple PDF text extraction — grabs readable strings
                textContent = rawText.replace(/[^\x20-\x7E\xC0-\xFF\n]/g, " ").replace(/\s+/g, " ").trim();
                if (textContent.length < 50) {
                    textContent = `[Documento PDF: ${doc.title}] ${doc.description || "Conteudo do arquivo PDF"}.`;
                }
            } else if (doc.mime_type?.startsWith("image/")) {
                // For images, create a descriptive text entry
                textContent = `[Imagem: ${doc.title}] ${doc.description || "Imagem institucional"}. Arquivo: ${doc.original_filename}.`;
            } else {
                textContent = `[Documento: ${doc.title}] ${doc.description || "Documento da empresa"}. Arquivo: ${doc.original_filename}.`;
            }
        }

        if (!textContent || textContent.trim().length < 10) {
            await supabase.from("knowledge_documents").update({ status: "error" }).eq("id", documentId);
            return new Response(
                JSON.stringify({ error: "No text content to process" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Add title and description as context
        const fullText = `# ${doc.title}\n${doc.description ? doc.description + "\n\n" : "\n"}${textContent}`;

        // 3. Chunking — split by paragraphs, max ~500 tokens per chunk
        const chunks = smartChunk(fullText, 500);

        // 4. Delete existing chunks for this document
        await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);

        // 5. Generate embeddings and insert chunks
        let successCount = 0;
        const BATCH_SIZE = 20;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);

            // Call OpenAI embeddings API
            const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "text-embedding-3-small",
                    input: batch,
                }),
            });

            if (!embResponse.ok) {
                const errText = await embResponse.text();
                console.error("OpenAI Embeddings Error:", errText);
                continue;
            }

            const embData = await embResponse.json();

            // Insert chunks with embeddings
            const rows = embData.data.map((emb: any, idx: number) => ({
                document_id: documentId,
                tenant_id: doc.tenant_id,
                content: batch[idx],
                embedding: JSON.stringify(emb.embedding),
                metadata: {
                    category: doc.category,
                    source_type: doc.source_type,
                    title: doc.title,
                    chunk_index: i + idx,
                },
            }));

            const { error: insertErr } = await supabase.from("knowledge_chunks").insert(rows);
            if (insertErr) {
                console.error("Chunk insert error:", insertErr);
            } else {
                successCount += rows.length;
            }
        }

        // 6. Update document status
        await supabase
            .from("knowledge_documents")
            .update({ status: "ready", chunk_count: successCount })
            .eq("id", documentId);

        return new Response(
            JSON.stringify({
                success: true,
                chunks: successCount,
                documentId,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("process-knowledge error:", err);
        return new Response(
            JSON.stringify({ error: err.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

/**
 * Smart chunking: splits text into meaningful chunks
 * respecting paragraph boundaries, with a max token estimate.
 */
function smartChunk(text: string, maxTokens: number): string[] {
    const paragraphs = text.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = "";

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        const estimatedTokens = (current + "\n\n" + trimmed).length / 4;

        if (estimatedTokens > maxTokens && current) {
            chunks.push(current.trim());
            current = trimmed;
        } else {
            current = current ? current + "\n\n" + trimmed : trimmed;
        }
    }

    if (current.trim()) {
        chunks.push(current.trim());
    }

    // If we got no chunks from paragraph splitting, force-split by character count
    if (chunks.length === 0 && text.trim().length > 0) {
        const charsPerChunk = maxTokens * 4;
        for (let i = 0; i < text.length; i += charsPerChunk) {
            chunks.push(text.slice(i, i + charsPerChunk).trim());
        }
    }

    return chunks;
}
