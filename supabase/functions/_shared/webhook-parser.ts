export interface ParsedResult {
    ignore: boolean;
    reason?: string;
    msg?: any;
    payload?: any;
    remoteJid?: string;
    cleanPhone?: string;
    isGroup?: boolean;
    messageId?: string;
}

export function extractMessageAndPhone(payload: any): ParsedResult {
    const msg = payload.message || payload.data || payload.body || payload;
    const eventData = typeof payload.event === 'object' ? payload.event : null;
    const eventType = eventData?.Type || payload.EventType || '';

    // Skip status events (Read, Delivered, Played, etc.)
    const statusEvents = ['Read', 'Delivered', 'Played', 'DeliveredAll', 'ReadAll', 'Composing'];
    if (statusEvents.includes(eventType)) {
        return { ignore: true, reason: 'status_event_ignored' };
    }

    let remoteJid = msg.key?.remoteJid || "";

    if (!remoteJid || remoteJid.includes("@lid")) {
        const candidates = [
            payload.sender_pn,
            msg.sender_pn,
            payload.chat?.id,
            payload.chatid,
            msg.sender,
            eventData?.Chat,
            msg.Chat,
            eventData?.Sender,
            msg.chatid,
            payload.remoteJid,
            msg.remoteJid,
        ];

        // First pass: find value with @s.whatsapp.net
        for (const c of candidates) {
            if (c && typeof c === 'string' && c.includes("@s.whatsapp.net")) {
                remoteJid = c;
                break;
            }
        }

        // Second pass: find any phone-like value (10-15 digits, no @lid)
        if (!remoteJid || remoteJid.includes("@lid")) {
            for (const c of candidates) {
                if (c && typeof c === 'string' && /^\d{10,15}$/.test(c.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", ""))) {
                    if (!c.includes("@lid")) {
                        remoteJid = c.includes("@") ? c : c + "@s.whatsapp.net";
                        break;
                    }
                }
            }
        }
    }

    if (!remoteJid || remoteJid.includes("status@broadcast")) {
        return { ignore: true, reason: 'ignored' };
    }

    const cleanPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "");
    const isGroup = remoteJid.includes("@g.us");
    const fromMe = msg.key?.fromMe || msg.fromMe || msg.IsFromMe || false;
    const wasSentByApi = msg.wasSentByApi || false;

    if (fromMe || wasSentByApi) {
        return { ignore: true, reason: 'own message' };
    }

    return {
        ignore: false,
        msg,
        payload,
        remoteJid,
        cleanPhone,
        isGroup,
        messageId: msg.key?.id || msg.id || msg.messageId || ""
    };
}
