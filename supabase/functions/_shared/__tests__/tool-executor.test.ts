import { executeTools, ToolExecutorContext } from "../tool-executor.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";

/**
 * Mock Supabase that tracks inserts/updates for assertions
 */
class ToolMockSupabase {
    public updates: any[] = [];
    public inserts: any[] = [];

    from(table: string) {
        return {
            select: () => this,
            eq: () => this,
            in: () => this,
            gte: () => this,
            lte: () => this,
            single: async () => ({ data: { id: "media-uuid", storage_path: "path/to.jpg", title: "Imagem.jpg", mime_type: "image/jpeg" } }),
            update: (args: any) => {
                this.updates.push({ table, args });
                return this;
            },
            insert: (args: any) => {
                this.inserts.push({ table, args });
                return this;
            }
        };
    }

    storage = {
        from: (bucket: string) => ({
            getPublicUrl: (path: string) => ({ data: { publicUrl: "https://public.url" } })
        })
    };
}

Deno.test("Tool Executor - schedule_appointment (QA Test)", async () => {
    const db = new ToolMockSupabase() as any;

    const context: ToolExecutorContext = {
        supabase: db,
        tenantId: "t1",
        agentId: "a1",
        lead: { id: "l1", status: "novo" },
        agentName: "Bot",
        cleanPhone: "5511999999999",
        currentStep: null,
        funnelSteps: [],
        config: {},
        uazBase: "http://mock",
        uazKey: "key",
        remoteJid: "5511999999999@s.whatsapp.net"
    };

    const toolCalls = [
        {
            function: {
                name: "schedule_appointment",
                arguments: '{"datetime": "amanhã as 15h"}' // AI Hallucination!
            }
        }
    ];

    const result = await executeTools(toolCalls, context);

    // It should push INVALID_DATE_FORMAT and NOT crash or insert anything
    assertEquals(result.executed.includes("INVALID_DATE_FORMAT"), true);
    assertEquals(db.inserts.length, 0); // Should not have inserted an "Invalid Date"
});

Deno.test("Tool Executor - schedule_appointment (Valid)", async () => {
    const db = new ToolMockSupabase() as any;

    const context: ToolExecutorContext = {
        supabase: db,
        tenantId: "t1",
        agentId: "a1",
        lead: { id: "l1", status: "novo" },
        agentName: "Bot",
        cleanPhone: "5511999999999",
        currentStep: null,
        funnelSteps: [],
        config: {},
        uazBase: "http://mock",
        uazKey: "key",
        remoteJid: "5511999999999@s.whatsapp.net"
    };

    const toolCalls = [
        {
            function: {
                name: "schedule_appointment",
                arguments: '{"datetime": "2026-05-10T14:00"}' // Valid
            }
        }
    ];

    const result = await executeTools(toolCalls, context);

    assertEquals(result.executed.includes("SCHEDULED"), true);
    assertEquals(db.inserts[0].table, "appointments");
    assertEquals(db.updates[0].table, "leads"); // Status shifted queue
});
