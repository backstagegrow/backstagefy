/**
 * media-processor.ts — Fase 7 do AI Concierge v7
 * Processa mensagens de áudio via Uazapi + Whisper (OpenAI)
 * Portado do monólito ai-concierge-v5-final (linhas 214-297)
 */

export interface AudioProcessResult {
    transcribed: boolean;
    text: string;
    error?: string;
}

/**
 * Detecta se a mensagem é um áudio/PTT
 */
export function isAudioMessage(msg: any): boolean {
    return (
        msg.mediaType === 'ptt' ||
        msg.mediaType === 'audio' ||
        msg.messageType === 'AudioMessage'
    );
}

/**
 * Processa mensagem de áudio:
 * 1. Solicita download via Uazapi /message/download
 * 2. Usa transcrição nativa do Uazapi se disponível
 * 3. Fallback: download MP3 + Whisper OpenAI
 */
export async function processAudioMessage(
    msg: any,
    messageId: string | undefined,
    uazBase: string,
    uazKey: string,
    openaiApiKey: string
): Promise<AudioProcessResult> {
    if (!messageId) {
        return { transcribed: false, text: '', error: 'No messageId for audio download' };
    }

    try {
        // Step 1: Request download URL from Uazapi
        const dlRes = await fetch(`${uazBase}/message/download`, {
            method: 'POST',
            headers: { 'token': uazKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: messageId, return_link: true, generate_mp3: true })
        });

        if (!dlRes.ok) {
            return { transcribed: false, text: '', error: `Uazapi /message/download failed: ${dlRes.status}` };
        }

        const dlData = await dlRes.json();

        // Step 2: Use Uazapi native transcription if available
        if (dlData.transcription) {
            return { transcribed: true, text: dlData.transcription };
        }

        const fileURL = dlData.fileURL || dlData.fileUrl || dlData.url;
        if (!fileURL) {
            return { transcribed: false, text: '', error: 'No fileURL from Uazapi' };
        }

        // Step 3: Download the audio file
        const audioRes = await fetch(fileURL);
        if (!audioRes.ok) {
            return { transcribed: false, text: '', error: `Audio download failed: ${audioRes.status}` };
        }

        const audioBuffer = await audioRes.arrayBuffer();
        if (audioBuffer.byteLength <= 100) {
            return { transcribed: false, text: '', error: 'Audio file too small' };
        }

        // Step 4: Transcribe with OpenAI Whisper
        const mimeType = dlData.mimetype || 'audio/mpeg';
        const ext = mimeType.includes('ogg') ? 'ogg' : 'mp3';
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiApiKey}` },
            body: formData
        });

        if (!whisperRes.ok) {
            return { transcribed: false, text: '', error: `Whisper API error: ${whisperRes.status}` };
        }

        const whisperData = await whisperRes.json();
        const transcribedText = whisperData.text || '';

        return { transcribed: true, text: transcribedText };

    } catch (e: any) {
        return { transcribed: false, text: '', error: e.message };
    }
}
