const payload = {
    "id": "5519996597169:3EB090191E6A868EF83207",
    "type": "media",
    "content": {
        "PTT": true,
        "URL": "https://mmg.whatsapp.net/v/t62.7117-24/633368885_917042607385055_2807517137941167775_n.enc?ccb=11-4&oh=01_Q5Aa3wEYo4fNzesUcgf71znpnnyiStQ0DgzdmBmsMffzB3Jn4w&oe=69B221F2&_nc_sid=5e03e0&mms3=true"
    }
};

const msg = payload;
const isAudio = true;

console.log("--- SIMULATION START ---");

const mediaUrl = msg.mediaUrl || msg.url || msg.content?.URL || payload.url || payload.mediaUrl;
console.log(`[HAUS] AUDIO PATH: ${mediaUrl} (Type: ${typeof mediaUrl})`);

if (mediaUrl) {
    try {
        // PROACTIVE CHECK FOR ENCRYPTED URLS
        if (mediaUrl.includes('.enc') || mediaUrl.includes('mmg.whatsapp.net')) {
            console.log("[HAUS] Encrypted media detected. Aborting fetch.");
        } else {
            console.log("[HAUS] Not encrypted, proceeding fetch.");
        }
    } catch (e) {
        console.error("ERROR:", e);
    }
} else {
    console.log("No mediaUrl found.");
}
