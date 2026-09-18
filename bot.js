(function () {
  /* ── ImpoBot Chat Widget ── */
  const SK = 'impobot_api_key';
  const HK = 'impobot_chat_hist';
  const MAX_HIST = 10; // mensajes a mantener en contexto

  const SYSTEM = `Sos ImpoBot, asistente virtual de impuestos y contabilidad argentina, creado por el Estudio Contable ImpoBot (impobot.com.ar).

Respondés preguntas sobre:
- ARCA/AFIP: vencimientos, regímenes, declaraciones juradas, empadronamientos
- Monotributo: categorías (2026), recategorizaciones, exclusiones, altas/bajas
- Ganancias 4ª categoría: retenciones RG 4003, deducciones, liquidación anual 2026
- Sueldos y cargas sociales: liquidación, aportes SIPA (tope $4.691.748,47 sept 2026), contribuciones patronales, LSD
- Autónomos: categorías A-J, aportes mensuales 2026
- IVA, IIBB, Convenio Multilateral (CM05)
- Intereses resarcitorios y punitorios ARCA (tasas vigentes 2025/2026)
- UVA, haberes jubilatorios, SMVyM
- SAC, indemnizaciones, F.931

Reglas:
- Respondés en español rioplatense (vos/ustedes)
- Sos conciso y directo, sin rodeos
- Citás la norma cuando la conocés (Res. ARCA, Ley, Decreto)
- Si algo puede variar por caso, lo aclarás brevemente
- Para casos complejos decís "te recomiendo consultar directamente con el estudio"
- Si no sabés algo, lo decís sin inventar
- No sos abogado ni reemplazás asesoramiento profesional`;

  /* ── Crear HTML del widget ── */
  const style = document.createElement('style');
  style.textContent = `
    #ib-btn{position:fixed;bottom:20px;left:20px;z-index:9990;background:#1e90d4;color:#fff;border:none;border-radius:50px;padding:12px 18px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;gap:8px;transition:transform .15s}
    #ib-btn:hover{transform:scale(1.05)}
    #ib-panel{position:fixed;bottom:78px;left:20px;width:340px;height:480px;background:#2d4f68;border:1px solid #4d7a96;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9990;display:none;flex-direction:column;overflow:hidden;font-family:inherit}
    #ib-header{background:#1e3a4e;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}
    #ib-header span{color:#f0f6fb;font-weight:700;font-size:14px}
    #ib-close{background:none;border:none;color:#9dbdd6;font-size:20px;cursor:pointer;padding:0 4px}
    #ib-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    .ib-msg{max-width:85%;padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5;word-wrap:break-word}
    .ib-msg.bot{background:#375e7a;color:#f0f6fb;align-self:flex-start;border-bottom-left-radius:4px}
    .ib-msg.user{background:#1e90d4;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
    .ib-typing{display:flex;gap:4px;padding:10px 13px;background:#375e7a;border-radius:12px;border-bottom-left-radius:4px;align-self:flex-start}
    .ib-typing span{width:7px;height:7px;background:#9dbdd6;border-radius:50%;animation:ib-bounce .9s infinite}
    .ib-typing span:nth-child(2){animation-delay:.15s}
    .ib-typing span:nth-child(3){animation-delay:.3s}
    @keyframes ib-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
    #ib-form{display:flex;gap:8px;padding:10px 12px;background:#1e3a4e;border-top:1px solid #4d7a96}
    #ib-input{flex:1;background:#2d4f68;border:1px solid #4d7a96;border-radius:8px;padding:8px 12px;color:#f0f6fb;font-size:13px;outline:none;resize:none;height:38px;font-family:inherit}
    #ib-input::placeholder{color:#9dbdd6}
    #ib-send{background:#1e90d4;border:none;border-radius:8px;color:#fff;padding:8px 14px;cursor:pointer;font-size:15px;transition:background .15s}
    #ib-send:hover{background:#1678b8}
    #ib-key-bar{padding:10px 12px;background:#1e3a4e;border-top:1px solid #4d7a96;font-size:11px;color:#9dbdd6;text-align:center;cursor:pointer}
    #ib-key-bar:hover{color:#f0f6fb}
    #ib-msgs::-webkit-scrollbar{width:4px}
    #ib-msgs::-webkit-scrollbar-thumb{background:#4d7a96;border-radius:4px}
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'ib-btn';
  btn.innerHTML = '🤖 <span>ImpoBot IA</span>';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'ib-panel';
  panel.innerHTML = `
    <div id="ib-header">
      <span>🤖 ImpoBot — Consultas fiscales</span>
      <button id="ib-close">✕</button>
    </div>
    <div id="ib-msgs"></div>
    <div id="ib-form">
      <textarea id="ib-input" placeholder="Preguntá sobre impuestos argentinos…" rows="1"></textarea>
      <button id="ib-send">➤</button>
    </div>
    <div id="ib-key-bar" id="ib-key-bar">🔑 Configurar API Key</div>
  `;
  document.body.appendChild(panel);

  /* ── Estado ── */
  let open = false;
  let loading = false;
  let history = [];

  function getKey() { return localStorage.getItem(SK) || ''; }
  function setKey(k) { localStorage.setItem(SK, k); }

  function updateKeyBar() {
    const bar = document.getElementById('ib-key-bar');
    if (!bar) return;
    bar.textContent = getKey() ? '🔑 API Key configurada — clic para cambiar' : '⚠️ Configurar API Key de Anthropic para usar el bot';
  }

  function addMsg(role, text) {
    const msgs = document.getElementById('ib-msgs');
    const div = document.createElement('div');
    div.className = 'ib-msg ' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function addTyping() {
    const msgs = document.getElementById('ib-msgs');
    const div = document.createElement('div');
    div.className = 'ib-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    div.id = 'ib-typing';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('ib-typing');
    if (t) t.remove();
  }

  async function sendMsg() {
    const input = document.getElementById('ib-input');
    const text = (input.value || '').trim();
    if (!text || loading) return;

    const key = getKey();
    if (!key) {
      promptKey();
      return;
    }

    input.value = '';
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    if (history.length > MAX_HIST * 2) history = history.slice(-MAX_HIST * 2);

    loading = true;
    addTyping();

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: SYSTEM,
          messages: history
        })
      });

      const data = await res.json();
      removeTyping();

      if (data.error) {
        const msg = data.error.type === 'authentication_error'
          ? '❌ API Key inválida. Hacé clic en "Configurar API Key" para corregirla.'
          : '❌ Error: ' + data.error.message;
        addMsg('bot', msg);
      } else {
        const reply = data.content[0].text;
        addMsg('bot', reply);
        history.push({ role: 'assistant', content: reply });
      }
    } catch (e) {
      removeTyping();
      addMsg('bot', '❌ No se pudo conectar. Verificá tu conexión a internet.');
    }

    loading = false;
  }

  function promptKey() {
    const k = prompt(
      '🔑 Ingresá tu API Key de Anthropic\n\n' +
      'Obtenerla gratis en: console.anthropic.com\n' +
      '(la clave empieza con "sk-ant-")\n\n' +
      'Se guarda solo en tu navegador, nunca en el servidor.'
    );
    if (k && k.startsWith('sk-ant-')) {
      setKey(k.trim());
      updateKeyBar();
      addMsg('bot', '✅ API Key configurada. ¡Ahora podés hacer tus consultas!');
    } else if (k) {
      alert('La key debe empezar con "sk-ant-". Verificá que la copiaste completa.');
    }
  }

  /* ── Bienvenida ── */
  function showWelcome() {
    const msgs = document.getElementById('ib-msgs');
    if (msgs.children.length === 0) {
      addMsg('bot', '¡Hola! Soy ImpoBot 🤖\n\nPreguntame sobre:\n• Vencimientos ARCA/AFIP\n• Monotributo\n• Ganancias 4ª Cat.\n• Sueldos y cargas sociales\n• Intereses y multas\n• Y cualquier duda fiscal argentina');
    }
  }

  /* ── Eventos ── */
  btn.addEventListener('click', function () {
    open = !open;
    panel.style.display = open ? 'flex' : 'none';
    if (open) { showWelcome(); updateKeyBar(); document.getElementById('ib-input').focus(); }
  });

  document.getElementById('ib-close').addEventListener('click', function () {
    open = false;
    panel.style.display = 'none';
  });

  document.getElementById('ib-send').addEventListener('click', sendMsg);

  document.getElementById('ib-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });

  document.getElementById('ib-key-bar').addEventListener('click', promptKey);

})();
