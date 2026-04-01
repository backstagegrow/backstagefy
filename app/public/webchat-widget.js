/**
 * Backstagefy Webchat Widget
 *
 * Embed no site do cliente:
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

  // --- Config from data attributes ---
  const scriptTag = document.currentScript ||
    [...document.querySelectorAll("script")].find(s => s.src && s.src.includes("webchat-widget"));

  const cfg = {
    tenantId: scriptTag?.dataset?.tenantId || "",
    supabaseUrl: scriptTag?.dataset?.supabaseUrl || "",
    primaryColor: scriptTag?.dataset?.primaryColor || "#7c3aed",
    botName: scriptTag?.dataset?.botName || "Assistente IA",
    welcomeMsg: scriptTag?.dataset?.welcomeMessage || "Olá! 👋 Como posso ajudar você hoje?",
    position: scriptTag?.dataset?.position || "right", // "right" | "left"
  };

  if (!cfg.tenantId || !cfg.supabaseUrl) {
    console.warn("[Backstagefy Webchat] data-tenant-id e data-supabase-url são obrigatórios.");
    return;
  }

  const ENDPOINT = `${cfg.supabaseUrl}/functions/v1/webchat`;
  const SESSION_KEY = `bsfy_wc_session_${cfg.tenantId}`;

  // --- State ---
  let sessionId = localStorage.getItem(SESSION_KEY) || null;
  let isOpen = false;
  let isLoading = false;

  // --- Styles ---
  const style = document.createElement("style");
  style.textContent = `
    #bsfy-wc-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #bsfy-wc-root { position: fixed; ${cfg.position}: 20px; bottom: 20px; z-index: 9999; }

    #bsfy-wc-btn {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${cfg.primaryColor}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #bsfy-wc-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    #bsfy-wc-btn svg { width: 26px; height: 26px; fill: #fff; }

    #bsfy-wc-box {
      display: none; flex-direction: column;
      position: absolute; ${cfg.position}: 0; bottom: 68px;
      width: 360px; max-width: calc(100vw - 40px);
      height: 500px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      overflow: hidden;
    }
    #bsfy-wc-box.open { display: flex; animation: bsfy-slide-up 0.25s ease; }

    @keyframes bsfy-slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    #bsfy-wc-header {
      background: ${cfg.primaryColor};
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
    }
    #bsfy-wc-header .bsfy-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    #bsfy-wc-header .bsfy-info { flex: 1; }
    #bsfy-wc-header .bsfy-name { color: #fff; font-weight: 600; font-size: 15px; }
    #bsfy-wc-header .bsfy-status { color: rgba(255,255,255,0.8); font-size: 12px; }
    #bsfy-wc-close {
      background: none; border: none; cursor: pointer;
      color: rgba(255,255,255,0.8); font-size: 20px; padding: 0 4px; line-height: 1;
    }
    #bsfy-wc-close:hover { color: #fff; }

    #bsfy-wc-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f8f8fc;
    }
    #bsfy-wc-messages::-webkit-scrollbar { width: 4px; }
    #bsfy-wc-messages::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }

    .bsfy-msg {
      max-width: 82%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.5; word-break: break-word;
    }
    .bsfy-msg.bot {
      background: #fff; color: #1a1a2e;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      align-self: flex-start;
    }
    .bsfy-msg.user {
      background: ${cfg.primaryColor}; color: #fff;
      border-bottom-right-radius: 4px;
      align-self: flex-end;
    }

    .bsfy-typing {
      align-self: flex-start;
      background: #fff; padding: 10px 14px; border-radius: 14px;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      display: flex; gap: 5px; align-items: center;
    }
    .bsfy-typing span {
      width: 7px; height: 7px; border-radius: 50%;
      background: #aaa; animation: bsfy-bounce 1.2s infinite;
    }
    .bsfy-typing span:nth-child(2) { animation-delay: 0.2s; }
    .bsfy-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bsfy-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    #bsfy-wc-form {
      display: flex; gap: 8px; padding: 12px;
      background: #fff; border-top: 1px solid #eee;
    }
    #bsfy-wc-input {
      flex: 1; border: 1.5px solid #e5e5e5; border-radius: 22px;
      padding: 10px 16px; font-size: 14px; outline: none;
      transition: border-color 0.2s;
    }
    #bsfy-wc-input:focus { border-color: ${cfg.primaryColor}; }
    #bsfy-wc-send {
      width: 40px; height: 40px; border-radius: 50%;
      background: ${cfg.primaryColor}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.2s;
    }
    #bsfy-wc-send:disabled { opacity: 0.5; cursor: default; }
    #bsfy-wc-send svg { width: 18px; height: 18px; fill: #fff; }
  `;
  document.head.appendChild(style);

  // --- DOM ---
  const root = document.createElement("div");
  root.id = "bsfy-wc-root";
  root.innerHTML = `
    <div id="bsfy-wc-box">
      <div id="bsfy-wc-header">
        <div class="bsfy-avatar">🤖</div>
        <div class="bsfy-info">
          <div class="bsfy-name">${cfg.botName}</div>
          <div class="bsfy-status">● Online</div>
        </div>
        <button id="bsfy-wc-close" aria-label="Fechar chat">×</button>
      </div>
      <div id="bsfy-wc-messages"></div>
      <form id="bsfy-wc-form" autocomplete="off">
        <input id="bsfy-wc-input" type="text" placeholder="Digite sua mensagem..." maxlength="500" />
        <button id="bsfy-wc-send" type="submit" aria-label="Enviar">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
    <button id="bsfy-wc-btn" aria-label="Abrir chat">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    </button>
  `;
  document.body.appendChild(root);

  const box = root.querySelector("#bsfy-wc-box");
  const btn = root.querySelector("#bsfy-wc-btn");
  const closeBtn = root.querySelector("#bsfy-wc-close");
  const messagesEl = root.querySelector("#bsfy-wc-messages");
  const form = root.querySelector("#bsfy-wc-form");
  const input = root.querySelector("#bsfy-wc-input");
  const sendBtn = root.querySelector("#bsfy-wc-send");

  // --- Helpers ---
  function appendMsg(text, role) {
    const el = document.createElement("div");
    el.className = `bsfy-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "bsfy-typing";
    el.id = "bsfy-typing-indicator";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("bsfy-typing-indicator");
    if (el) el.remove();
  }

  function setLoading(val) {
    isLoading = val;
    sendBtn.disabled = val;
    input.disabled = val;
  }

  // --- Toggle ---
  function openChat() {
    isOpen = true;
    box.classList.add("open");
    btn.innerHTML = `<svg viewBox="0 0 24 24" style="fill:#fff;width:22px;height:22px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    setTimeout(() => input.focus(), 250);
    // Show welcome message only on first open with empty history
    if (messagesEl.children.length === 0) {
      appendMsg(cfg.welcomeMsg, "bot");
    }
  }

  function closeChat() {
    isOpen = false;
    box.classList.remove("open");
    btn.innerHTML = `<svg viewBox="0 0 24 24" style="fill:#fff;width:26px;height:26px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  }

  btn.addEventListener("click", () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener("click", closeChat);

  // --- Send message ---
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || isLoading) return;

    input.value = "";
    appendMsg(text, "user");
    setLoading(true);
    showTyping();

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: cfg.tenantId,
          message: text,
          session_id: sessionId || undefined,
        }),
      });

      hideTyping();

      if (!res.ok) {
        appendMsg("Desculpe, houve um erro. Tente novamente.", "bot");
      } else {
        const data = await res.json();
        if (data.session_id) {
          sessionId = data.session_id;
          localStorage.setItem(SESSION_KEY, sessionId);
        }
        appendMsg(data.reply || "...", "bot");
      }
    } catch (_) {
      hideTyping();
      appendMsg("Sem conexão. Verifique sua internet e tente novamente.", "bot");
    } finally {
      setLoading(false);
      input.focus();
    }
  });
})();
