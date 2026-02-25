
export async function decryptMedia(mediaKeyBase64: string, mimeType: string, encryptedData: ArrayBuffer): Promise<Uint8Array> {
    // Decode Base64 Media Key
    const binaryString = atob(mediaKeyBase64);
    const len = binaryString.length;
    const mediaKey = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        mediaKey[i] = binaryString.charCodeAt(i);
    }

    // Determine Info String based on MimeType
    let infoStr = "WhatsApp Audio Keys";
    if (mimeType.includes("image")) infoStr = "WhatsApp Image Keys";
    else if (mimeType.includes("video")) infoStr = "WhatsApp Video Keys";
    else if (mimeType.includes("document")) infoStr = "WhatsApp Document Keys";
    else if (mimeType.includes("application/pdf")) infoStr = "WhatsApp Document Keys";

    console.log(`[DECRYPT] Deriving keys for ${mimeType} with info: ${infoStr}`);

    // Import Key for HKDF
    const baseKey = await crypto.subtle.importKey(
        "raw",
        mediaKey,
        "HKDF",
        false,
        ["deriveBits"]
    );

    const info = new TextEncoder().encode(infoStr);
    const salt = new Uint8Array(32); // 32 bytes of 0

    // HKDF Derive 112 bytes
    const derivedBits = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info },
        baseKey,
        112 * 8
    );

    const derived = new Uint8Array(derivedBits);
    const iv = derived.slice(0, 16);
    const cipherKey = derived.slice(16, 48);
    // const macKey = derived.slice(48, 80); // Used for validating MAC, skipping for now

    // Remove 10 bytes MAC from end of file
    if (encryptedData.byteLength <= 10) {
        throw new Error("File too short to contain MAC");
    }
    const encryptedContent = encryptedData.slice(0, -10);

    // Import AES Key
    const key = await crypto.subtle.importKey(
        "raw",
        cipherKey,
        "AES-CBC",
        false,
        ["decrypt"]
    );

    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv },
            key,
            encryptedContent
        );
        return new Uint8Array(decryptedBuffer);
    } catch (e: any) {
        console.error("Decryption failed", e);
        throw new Error(`Decryption failed: ${e.message}`);
    }
}
