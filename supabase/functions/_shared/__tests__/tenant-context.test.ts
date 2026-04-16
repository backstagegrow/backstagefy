import { checkGuards } from "../tenant-context.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";

/**
 * Mock Supabase Client
 */
class MockSupabase {
    from(table: string) {
        return {
            select: () => this,
            eq: () => this,
            single: async () => {
                if (table === 'tenants') {
                    return {
                        data: {
                            name: "Mock Tenant",
                            settings: {
                                ignoreGroups: true,
                                whitelistEnabled: true,
                                whitelistNumbers: ["5511999999999"]
                            }
                        }
                    };
                }
                return { data: null };
            }
        };
    }
}

Deno.test("Tenant Context - Ignore Group Config", async () => {
    const db = new MockSupabase() as any;
    const guards = await checkGuards(db, "tenant-id-123", "12345-6789@g.us", true);

    assertEquals(guards.blocked, true);
    assertEquals(guards.reason, "ignored group");
});

Deno.test("Tenant Context - Whitelist Allow", async () => {
    const db = new MockSupabase() as any;
    const guards = await checkGuards(db, "tenant-id-123", "5511999999999", false);

    assertEquals(guards.blocked, false);
    assertEquals(guards.tenantName, "Mock Tenant");
});

Deno.test("Tenant Context - Whitelist Block", async () => {
    const db = new MockSupabase() as any;
    const guards = await checkGuards(db, "tenant-id-123", "5511000000000", false);

    assertEquals(guards.blocked, true);
    assertEquals(guards.reason, "unauthorized");
});
