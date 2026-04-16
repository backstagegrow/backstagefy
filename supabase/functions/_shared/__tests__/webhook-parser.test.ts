import { extractMessageAndPhone } from "./webhook-parser.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";

Deno.test("Extract Message - Standard WhatsApp User", () => {
    const payload = {
        message: {
            key: { remoteJid: "5511999999999@s.whatsapp.net" },
            text: "Hello, world!"
        }
    };
    const result = extractMessageAndPhone(payload);

    assertEquals(result.ignore, false);
    assertEquals(result.cleanPhone, "5511999999999");
    assertEquals(result.isGroup, false);
});

Deno.test("Extract Message - UAZAPI @lid fallback", () => {
    const payload = {
        message: {
            key: { remoteJid: "12345678901234@lid" }, // LID format
            sender_pn: "5511888888888@s.whatsapp.net", // Fallback sender
            text: "Hi"
        }
    };

    const result = extractMessageAndPhone(payload);

    assertEquals(result.ignore, false);
    assertEquals(result.cleanPhone, "5511888888888"); // Should have extracted this from sender_pn
});

Deno.test("Extract Message - Ignore Group if @g.us", () => {
    const payload = {
        message: {
            key: { remoteJid: "123456789-987654@g.us" }
        }
    };

    const result = extractMessageAndPhone(payload);
    assertEquals(result.isGroup, true);
});

Deno.test("Extract Message - Ignore Status Broadcasts", () => {
    const payload = {
        message: {
            key: { remoteJid: "status@broadcast" }
        }
    };

    const result = extractMessageAndPhone(payload);
    assertEquals(result.ignore, true);
    assertEquals(result.reason, "ignored");
});
