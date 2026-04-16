import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

export async function buildKnowledgeContext(supabase: SupabaseClient, tenantId: string) {
    let kbContext = "";
    try {
        const { data: chunks } = await supabase.from('knowledge_chunks')
            .select('content').eq('tenant_id', tenantId).limit(5);
        if (chunks?.length) {
            kbContext = "\n[BASE DE CONHECIMENTO]\n" + chunks.map((c: any) => c.content).join("\n---\n");
        }
    } catch (e) { /* KB optional */ }

    let mediaContext = "";
    try {
        const { data: mediaItems } = await supabase.from('knowledge_documents')
            .select('id, title, description, storage_path, mime_type, category')
            .eq('tenant_id', tenantId)
            .in('category', ['media', 'documents'])
            .not('storage_path', 'is', null)
            .limit(20);

        if (mediaItems?.length) {
            const mediaList = mediaItems.map((m: any) => {
                const type = m.mime_type?.startsWith('image/') ? 'imagem' : m.mime_type?.includes('pdf') ? 'documento PDF' : 'arquivo';
                return `- [${m.id}] ${m.title} (${type})${m.description ? ': ' + m.description : ''}`;
            }).join('\n');
            mediaContext = `\n\n[MÍDIAS E DOCUMENTOS DISPONÍVEIS]\nVocê pode enviar estes arquivos usando send_media:\n${mediaList}`;
        }
    } catch (e) { /* media optional */ }

    return { kbContext, mediaContext };
}
