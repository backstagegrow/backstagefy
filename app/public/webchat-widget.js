/**
 * Backstagefy Webchat Widget
 *
 * <script
 *   src="https://SEU_DOMINIO/webchat-widget.js"
 *   data-tenant-id="SEU_TENANT_ID"
 *   data-supabase-url="https://xaivgzrmxewkevlqvphi.supabase.co"
 *   data-primary-color="#7c3aed"
 *   data-bot-name="Assistente"
 *   data-welcome-message="Olá! Como posso ajudar você hoje?"
 * ></script>
 */
(function () {
  "use strict";

  const scriptTag = document.currentScript ||
    [...document.querySelectorAll("script")].find(s => s.src && s.src.includes("webchat-widget"));

  const cfg = {
    tenantId:    scriptTag?.dataset?.tenantId    || "",
    supabaseUrl: scriptTag?.dataset?.supabaseUrl || "",
    color:       scriptTag?.dataset?.primaryColor || "#7c3aed",
    botName:     scriptTag?.dataset?.botName      || "Assistente IA",
    welcomeMsg:  scriptTag?.dataset?.welcomeMessage || "Olá! 👋 Como posso ajudar você hoje?",
    position:    scriptTag?.dataset?.position     || "right",
  };

  if (!cfg.tenantId || !cfg.supabaseUrl) {
    console.warn("[Backstagefy Webchat] data-tenant-id e data-supabase-url são obrigatórios.");
    return;
  }

  const ENDPOINT   = `${cfg.supabaseUrl}/functions/v1/webchat`;
  const SESSION_KEY = `bsfy_wc_${cfg.tenantId}`;

  let sessionId = localStorage.getItem(SESSION_KEY) || null;
  let isOpen    = false;
  let isLoading = false;
  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;

  // ─── CSS ───────────────────────────────────────────────────────────────────
  // All selectors prefixed with #bsfy-wc-root to scope them.
  // Critical properties use !important to survive host-site CSS resets.
  const C = cfg.color;
  const POS = cfg.position;

  const style = document.createElement("style");
  style.textContent = `
  /* ── Reset inside widget ── */
  #bsfy-wc-root, #bsfy-wc-root * {
    box-sizing: border-box !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    line-height: normal !important;
    -webkit-font-smoothing: antialiased;
  }
  #bsfy-wc-root button, #bsfy-wc-root input {
    font-family: inherit !important;
    font-size: inherit !important;
  }

  /* ── Root ── */
  #bsfy-wc-root {
    position: fixed !important;
    ${POS}: 20px !important;
    bottom: 20px !important;
    z-index: 2147483647 !important;
    display: block !important;
  }

  /* ── FAB button ── */
  #bsfy-wc-fab {
    width: 58px !important; height: 58px !important;
    border-radius: 50% !important;
    background: ${C} !important;
    border: none !important; outline: none !important; cursor: pointer !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.28) !important;
    transition: transform 0.2s, box-shadow 0.2s !important;
    padding: 0 !important; margin: 0 !important;
  }
  #bsfy-wc-fab:hover { transform: scale(1.07) !important; box-shadow: 0 6px 24px rgba(0,0,0,0.32) !important; }
  #bsfy-wc-fab svg   { width: 26px !important; height: 26px !important; fill: #fff !important; display: block !important; }

  /* ── Unread badge ── */
  #bsfy-wc-badge {
    position: absolute !important; top: -4px !important; ${POS}: -4px !important;
    width: 20px !important; height: 20px !important; border-radius: 50% !important;
    background: #ef4444 !important; color: #fff !important;
    font-size: 11px !important; font-weight: 700 !important;
    display: none !important; align-items: center !important; justify-content: center !important;
    border: 2px solid #fff !important;
  }
  #bsfy-wc-badge.show { display: flex !important; }

  /* ── Chat box ── */
  #bsfy-wc-box {
    display: none !important; flex-direction: column !important;
    position: absolute !important; ${POS}: 0 !important; bottom: 70px !important;
    width: 360px !important; max-width: calc(100vw - 40px) !important;
    height: 520px !important; max-height: calc(100vh - 110px) !important;
    background: #ffffff !important; border-radius: 20px !important;
    box-shadow: 0 12px 48px rgba(0,0,0,0.20) !important;
    overflow: hidden !important;
    border: 1px solid rgba(0,0,0,0.06) !important;
  }
  #bsfy-wc-box.open {
    display: flex !important;
    animation: bsfySlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1) both !important;
  }

  @keyframes bsfySlideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  /* ── Header ── */
  #bsfy-wc-header {
    background: ${C} !important;
    padding: 14px 16px !important;
    display: flex !important; align-items: center !important; gap: 10px !important;
    flex-shrink: 0 !important;
  }
  #bsfy-wc-avatar {
    width: 38px !important; height: 38px !important; border-radius: 50% !important;
    background: rgba(255,255,255,0.22) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    font-size: 20px !important; flex-shrink: 0 !important;
  }
  #bsfy-wc-header-info { flex: 1 !important; min-width: 0 !important; }
  #bsfy-wc-header-name {
    color: #fff !important; font-weight: 700 !important; font-size: 15px !important;
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
  }
  #bsfy-wc-header-status { color: rgba(255,255,255,0.78) !important; font-size: 11.5px !important; margin-top: 1px !important; display: flex !important; align-items: center !important; gap: 4px !important; }
  #bsfy-wc-status-dot {
    width: 7px !important; height: 7px !important; border-radius: 50% !important;
    background: #4ade80 !important;
    animation: bsfyPulse 2s infinite !important;
    display: inline-block !important; flex-shrink: 0 !important;
  }
  @keyframes bsfyPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.6; transform: scale(1.3); }
  }
  #bsfy-wc-close {
    background: rgba(255,255,255,0.12) !important; border: none !important; outline: none !important;
    cursor: pointer !important; color: #fff !important;
    width: 30px !important; height: 30px !important; border-radius: 50% !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    font-size: 18px !important; line-height: 1 !important; padding: 0 !important; flex-shrink: 0 !important;
    transition: background 0.2s !important;
  }
  #bsfy-wc-close:hover { background: rgba(255,255,255,0.24) !important; }

  /* ── Messages ── */
  #bsfy-wc-messages {
    flex: 1 !important; overflow-y: auto !important;
    padding: 16px !important;
    display: flex !important; flex-direction: column !important; gap: 8px !important;
    background: #f5f5fa !important;
    scroll-behavior: smooth !important;
  }
  #bsfy-wc-messages::-webkit-scrollbar { width: 4px; }
  #bsfy-wc-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

  .bsfy-msg {
    max-width: 80% !important;
    padding: 10px 14px !important;
    border-radius: 18px !important;
    font-size: 14px !important; line-height: 1.55 !important;
    word-break: break-word !important;
    animation: bsfyMsgIn 0.22s ease both !important;
  }
  @keyframes bsfyMsgIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .bsfy-msg.bot {
    background: #ffffff !important; color: #1a1a2e !important;
    border-bottom-left-radius: 4px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.09) !important;
    align-self: flex-start !important;
  }
  .bsfy-msg.user {
    background: ${C} !important; color: #ffffff !important;
    border-bottom-right-radius: 4px !important;
    align-self: flex-end !important;
  }
  .bsfy-msg.audio-msg {
    display: flex !important; align-items: center !important; gap: 8px !important;
    font-style: italic !important; opacity: 0.85 !important;
  }
  .bsfy-msg.audio-msg svg { width: 16px !important; height: 16px !important; flex-shrink: 0 !important; }

  /* ── Typing indicator ── */
  #bsfy-typing {
    align-self: flex-start !important;
    background: #ffffff !important;
    padding: 12px 16px !important; border-radius: 18px !important; border-bottom-left-radius: 4px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.09) !important;
    display: none !important; align-items: center !important; gap: 5px !important;
    animation: bsfyMsgIn 0.22s ease both !important;
  }
  #bsfy-typing.show { display: flex !important; }
  #bsfy-typing span {
    display: inline-block !important;
    width: 8px !important; height: 8px !important; border-radius: 50% !important;
    background: #9ca3af !important;
    animation: bsfyBounce 1.3s ease-in-out infinite !important;
    will-change: transform !important;
  }
  #bsfy-typing span:nth-child(1) { animation-delay: 0s    !important; }
  #bsfy-typing span:nth-child(2) { animation-delay: 0.18s !important; }
  #bsfy-typing span:nth-child(3) { animation-delay: 0.36s !important; }
  @keyframes bsfyBounce {
    0%, 60%, 100% { transform: translateY(0px);  background: #9ca3af; }
    30%            { transform: translateY(-8px); background: #6b7280; }
  }

  /* ── Form ── */
  #bsfy-wc-form {
    display: flex !important; align-items: center !important; gap: 8px !important;
    padding: 10px 12px !important;
    background: #ffffff !important; border-top: 1px solid #f0f0f0 !important;
    flex-shrink: 0 !important;
  }
  #bsfy-wc-input {
    flex: 1 !important; min-width: 0 !important;
    border: 1.5px solid #e5e7eb !important; border-radius: 24px !important;
    padding: 10px 16px !important; font-size: 14px !important;
    color: #111 !important; background: #fafafa !important;
    outline: none !important; transition: border-color 0.2s !important;
  }
  #bsfy-wc-input:focus    { border-color: ${C} !important; background: #fff !important; }
  #bsfy-wc-input:disabled { opacity: 0.5 !important; }

  /* ── Send button ── */
  #bsfy-wc-send {
    width: 40px !important; height: 40px !important; border-radius: 50% !important;
    background: ${C} !important; border: none !important; outline: none !important;
    cursor: pointer !important; flex-shrink: 0 !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    transition: opacity 0.2s, transform 0.15s !important; padding: 0 !important;
  }
  #bsfy-wc-send:hover:not(:disabled) { transform: scale(1.08) !important; }
  #bsfy-wc-send:disabled { opacity: 0.4 !important; cursor: default !important; }
  #bsfy-wc-send svg { width: 17px !important; height: 17px !important; fill: #fff !important; display: block !important; }

  /* ── Mic button ── */
  #bsfy-wc-mic {
    width: 40px !important; height: 40px !important; border-radius: 50% !important;
    background: #f3f4f6 !important; border: none !important; outline: none !important;
    cursor: pointer !important; flex-shrink: 0 !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    transition: background 0.2s, transform 0.15s !important; padding: 0 !important;
    position: relative !important;
  }
  #bsfy-wc-mic:hover { background: #e5e7eb !important; }
  #bsfy-wc-mic svg   { width: 18px !important; height: 18px !important; fill: #6b7280 !important; display: block !important; }
  #bsfy-wc-mic.recording {
    background: #fef2f2 !important;
    animation: bsfyRecordPulse 1s ease-in-out infinite !important;
  }
  #bsfy-wc-mic.recording svg { fill: #ef4444 !important; }
  @keyframes bsfyRecordPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
    50%       { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  }

  /* ── Recording bar ── */
  #bsfy-wc-rec-bar {
    display: none !important; align-items: center !important; gap: 8px !important;
    padding: 8px 14px !important; background: #fef2f2 !important;
    border-top: 1px solid #fee2e2 !important; flex-shrink: 0 !important;
  }
  #bsfy-wc-rec-bar.show { display: flex !important; }
  #bsfy-wc-rec-dot {
    width: 10px !important; height: 10px !important; border-radius: 50% !important;
    background: #ef4444 !important; flex-shrink: 0 !important;
    animation: bsfyRecDot 1s ease-in-out infinite !important;
  }
  @keyframes bsfyRecDot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
  #bsfy-wc-rec-bar span {
    font-size: 12px !important; color: #ef4444 !important; font-weight: 600 !important; flex: 1 !important;
  }
  #bsfy-wc-rec-cancel {
    background: none !important; border: none !important; outline: none !important;
    cursor: pointer !important; color: #9ca3af !important; font-size: 12px !important;
    padding: 2px 6px !important; border-radius: 4px !important;
    transition: color 0.2s !important;
  }
  #bsfy-wc-rec-cancel:hover { color: #6b7280 !important; }
  `;
  document.head.appendChild(style);

  // ─── DOM ───────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "bsfy-wc-root";
  root.innerHTML = `
    <div id="bsfy-wc-box">
      <div id="bsfy-wc-header">
        <div id="bsfy-wc-avatar">🤖</div>
        <div id="bsfy-wc-header-info">
          <div id="bsfy-wc-header-name">${cfg.botName}</div>
          <div id="bsfy-wc-header-status">
            <span id="bsfy-wc-status-dot"></span> Online
          </div>
        </div>
        <button id="bsfy-wc-close" aria-label="Fechar">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <div id="bsfy-wc-messages">
        <div id="bsfy-typing"><span></span><span></span><span></span></div>
      </div>

      <div id="bsfy-wc-rec-bar">
        <div id="bsfy-wc-rec-dot"></div>
        <span>Gravando áudio...</span>
        <button id="bsfy-wc-rec-cancel">Cancelar</button>
      </div>

      <form id="bsfy-wc-form" autocomplete="off">
        <input id="bsfy-wc-input" type="text" placeholder="Digite sua mensagem..." maxlength="500" />
        <button id="bsfy-wc-mic" type="button" aria-label="Gravar áudio" title="Segurar para gravar">
          <svg viewBox="0 0 24 24"><path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </button>
        <button id="bsfy-wc-send" type="submit" aria-label="Enviar">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>

    <div id="bsfy-wc-badge">1</div>
    <button id="bsfy-wc-fab" aria-label="Abrir chat">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    </button>
  `;
  document.body.appendChild(root);

  const box       = root.querySelector("#bsfy-wc-box");
  const fab       = root.querySelector("#bsfy-wc-fab");
  const badge     = root.querySelector("#bsfy-wc-badge");
  const closeBtn  = root.querySelector("#bsfy-wc-close");
  const messagesEl= root.querySelector("#bsfy-wc-messages");
  const typingEl  = root.querySelector("#bsfy-typing");
  const form      = root.querySelector("#bsfy-wc-form");
  const input     = root.querySelector("#bsfy-wc-input");
  const sendBtn   = root.querySelector("#bsfy-wc-send");
  const micBtn    = root.querySelector("#bsfy-wc-mic");
  const recBar    = root.querySelector("#bsfy-wc-rec-bar");
  const recCancel = root.querySelector("#bsfy-wc-rec-cancel");

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMsg(text, role, isAudio) {
    const el = document.createElement("div");
    el.className = `bsfy-msg ${role}${isAudio ? ' audio-msg' : ''}`;
    if (isAudio) {
      el.innerHTML = `<svg viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg> ${text}`;
    } else {
      el.textContent = text;
    }
    // Insert before typing indicator (which is last)
    messagesEl.insertBefore(el, typingEl);
    scrollBottom();
    return el;
  }

  function showTyping() {
    typingEl.classList.add("show");
    scrollBottom();
  }

  function hideTyping() {
    typingEl.classList.remove("show");
  }

  function setLoading(val) {
    isLoading = val;
    sendBtn.disabled = val;
    input.disabled   = val;
    micBtn.disabled  = val;
  }

  let recTimer = null;
  let recSeconds = 0;

  function startRecordingUI() {
    recBar.classList.add("show");
    micBtn.classList.add("recording");
    input.style.display = "none";
    sendBtn.style.display = "none";
    recSeconds = 0;
    recTimer = setInterval(() => {
      recSeconds++;
      const m = String(Math.floor(recSeconds / 60)).padStart(2, "0");
      const s = String(recSeconds % 60).padStart(2, "0");
      recBar.querySelector("span").textContent = `Gravando áudio... ${m}:${s}`;
    }, 1000);
  }

  function stopRecordingUI() {
    clearInterval(recTimer);
    recBar.classList.remove("show");
    micBtn.classList.remove("recording");
    input.style.display = "";
    sendBtn.style.display = "";
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────
  function openChat() {
    isOpen = true;
    box.classList.add("open");
    badge.classList.remove("show");
    fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    setTimeout(() => input.focus(), 280);
    if (messagesEl.querySelectorAll(".bsfy-msg").length === 0) {
      appendMsg(cfg.welcomeMsg, "bot");
    }
  }

  function closeChat() {
    isOpen = false;
    box.classList.remove("open");
    fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  }

  fab.addEventListener("click", () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener("click", closeChat);

  // ─── Send text ────────────────────────────────────────────────────────────
  async function sendMessage(text, audioBlob) {
    setLoading(true);
    showTyping();

    try {
      let body;

      if (audioBlob) {
        // Convert blob to base64
        const arrayBuffer = await audioBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        bytes.forEach(b => binary += String.fromCharCode(b));
        const base64 = btoa(binary);

        body = JSON.stringify({
          tenant_id:  cfg.tenantId,
          session_id: sessionId || undefined,
          audio_base64: base64,
          audio_mime:   audioBlob.type || "audio/webm",
        });
      } else {
        body = JSON.stringify({
          tenant_id:  cfg.tenantId,
          session_id: sessionId || undefined,
          message: text,
        });
      }

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      hideTyping();

      if (!res.ok) {
        appendMsg("Ops! Houve um erro. Tente novamente.", "bot");
      } else {
        const data = await res.json();
        if (data.session_id) {
          sessionId = data.session_id;
          localStorage.setItem(SESSION_KEY, sessionId);
        }
        appendMsg(data.reply || "...", "bot");
        if (!isOpen) badge.classList.add("show");
      }
    } catch (_) {
      hideTyping();
      appendMsg("Sem conexão. Verifique sua internet.", "bot");
    } finally {
      setLoading(false);
      if (!audioBlob) input.focus();
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || isLoading) return;
    input.value = "";
    appendMsg(text, "user");
    await sendMessage(text, null);
  });

  // ─── Audio recording ──────────────────────────────────────────────────────
  micBtn.addEventListener("click", async () => {
    if (isLoading) return;

    if (isRecording) {
      // Stop
      mediaRecorder.stop();
      return;
    }

    // Check support
    if (!navigator.mediaDevices?.getUserMedia) {
      appendMsg("Seu navegador não suporta gravação de áudio.", "bot");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunks   = [];
      isRecording   = true;
      startRecordingUI();

      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

      mediaRecorder.onstop = async () => {
        isRecording = false;
        stopRecordingUI();
        stream.getTracks().forEach(t => t.stop());

        if (audioChunks.length === 0) return;

        const blob = new Blob(audioChunks, { type: mimeType });
        appendMsg("🎤 Áudio enviado", "user", true);
        await sendMessage(null, blob);
      };

      mediaRecorder.start();
    } catch (err) {
      isRecording = false;
      stopRecordingUI();
      if (err.name === "NotAllowedError") {
        appendMsg("Permissão de microfone negada. Habilite nas configurações do navegador.", "bot");
      } else {
        appendMsg("Não foi possível acessar o microfone.", "bot");
      }
    }
  });

  recCancel.addEventListener("click", () => {
    if (mediaRecorder && isRecording) {
      audioChunks = []; // clear so onstop does nothing
      mediaRecorder.stop();
    }
  });

})();
