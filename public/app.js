(() => {
  const DEFAULT_MODEL = 'gemma3:4b';
  const $ = id => document.getElementById(id);
  const el = { app: $('app'), history: $('history'), messages: $('messages'), empty: $('empty'), scroller: $('scroller'),
    input: $('input'), send: $('sendBtn'), stop: $('stopBtn'), status: $('status'), statusText: $('statusText'), select: $('modelSelect') };

  let chats = load('offlineai.chats', []);
  let activeId = localStorage.getItem('offlineai.active');
  let model = localStorage.getItem('offlineai.model') || DEFAULT_MODEL;
  let installed = [], generating = false, controller = null;
  let mode = 'chat', ckpts = [], comfyOk = false, ollamaState = 'off', ckpt = localStorage.getItem('offlineai.ckpt') || '', attached = null, warmed = '';

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
  function save() {
    try { localStorage.setItem('offlineai.chats', JSON.stringify(chats)); localStorage.setItem('offlineai.active', activeId || ''); } catch {}
  }
  const active = () => chats.find(c => c.id === activeId);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- Markdown ---------- */
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => (codes.push(c), `\u0000${codes.length - 1}\u0000`));
    s = esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  }
  function md(text) {
    const out = [], lines = text.split('\n');
    let i = 0, para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`); para = []; } };
    while (i < lines.length) {
      const line = lines[i], fence = line.match(/^\s*```(\S*)/);
      if (fence) {
        flush(); const code = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push(`<div class="codeblock"><div class="codehead"><span>${esc(fence[1] || 'code')}</span><button class="copy">Copy</button></div><pre><code>${esc(code.join('\n'))}</code></pre></div>`);
        continue;
      }
      const h = line.match(/^(#{1,3})\s+(.*)/);
      const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)/);
      if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; }
      else if (li) {
        flush(); const tag = /\d/.test(li[1]) ? 'ol' : 'ul', items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)/);
          if (!m || (/\d/.test(m[1]) ? 'ol' : 'ul') !== tag) break;
          items.push(`<li>${inline(m[2])}</li>`); i++;
        }
        out.push(`<${tag}>${items.join('')}</${tag}>`);
      }
      else if (!line.trim()) { flush(); i++; }
      else { para.push(line); i++; }
    }
    flush();
    return out.join('');
  }

  /* ---------- Rendering ---------- */
  function msgNode(m) {
    const d = document.createElement('div');
    if (m.role === 'user') { d.className = 'msg user'; d.innerHTML = '<div class="body"></div>'; d.firstChild.textContent = m.content; }
    else if (m.image) {
      d.className = 'msg ai';
      d.innerHTML = '<svg class="logo av"><use href="#logo"/></svg><div class="body"><img class="gen" alt="Generated image"><div class="cap"></div><a class="dl" download="offline-ai.png">Download</a><button class="edit">Edit this</button></div>';
      const im = d.querySelector('img'); im.src = m.image; im.onload = () => scrollDown(true);
      d.querySelector('.cap').textContent = m.content; d.querySelector('.dl').href = m.image; d.querySelector('.edit').dataset.src = m.image;
    }
    else if (m.error) { d.className = 'msg ai error'; d.innerHTML = '<div class="body"></div>'; d.firstChild.textContent = m.content; }
    else { d.className = 'msg ai'; d.innerHTML = '<svg class="logo av"><use href="#logo"/></svg><div class="body"></div>'; d.querySelector('.body').innerHTML = md(m.content) + '<div class="acts"><button class="act" data-a="copy">Copy</button><button class="act" data-a="regen">Regenerate</button></div>'; }
    return d;
  }
  function renderChat() {
    const c = active();
    el.messages.innerHTML = '';
    (c ? c.messages : []).forEach(m => el.messages.appendChild(msgNode(m)));
    const rg = el.messages.querySelectorAll('[data-a=regen]'); rg.forEach((b, i) => b.hidden = i !== rg.length - 1);
    el.empty.style.display = c && c.messages.length ? 'none' : 'flex';
    scrollDown(true);
  }
  function renderHistory() {
    el.history.innerHTML = '';
    const q = $('search').value.trim().toLowerCase();
    chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q))).forEach(c => {
      const row = document.createElement('div');
      row.className = 'item' + (c.id === activeId ? ' active' : '');
      row.innerHTML = '<button class="t"></button><button class="x" aria-label="Delete chat">×</button>';
      row.querySelector('.t').textContent = c.title;
      row.querySelector('.t').ondblclick = () => { const n = prompt('Rename chat', c.title); if (n && n.trim()) { c.title = n.trim().slice(0, 60); save(); renderHistory(); } };
      row.querySelector('.t').onclick = () => { if (generating) return; activeId = c.id; save(); renderAll(); el.app.classList.remove('open'); };
      row.querySelector('.x').onclick = () => { if (generating) return; chats = chats.filter(x => x.id !== c.id); if (activeId === c.id) activeId = chats[0]?.id || null; save(); renderAll(); };
      el.history.appendChild(row);
    });
  }
  const renderAll = () => { renderHistory(); renderChat(); };
  function scrollDown(force) {
    const s = el.scroller;
    if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 140) { s.style.scrollBehavior = 'auto'; s.scrollTop = s.scrollHeight; }
  }

  /* ---------- Models & status ---------- */
  const pretty = n => n === 'gemma3:4b' ? 'Gemma 3 4B' : n;
  function setStatus(kind, text) { el.status.className = 'status ' + kind; el.statusText.textContent = text; }
  async function refreshModels() {
    try {
      const r = await fetch('/api/models');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      installed = d.models.map(m => m.name);
      ollamaState = installed.length ? 'ok' : 'nomodel';
    } catch { installed = []; ollamaState = 'off'; }
    const names = [...new Set([DEFAULT_MODEL, ...installed])];
    if (!names.includes(model)) model = DEFAULT_MODEL;
    el.select.innerHTML = '';
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = pretty(n) + (installed.includes(n) ? '' : ' (not installed)');
      el.select.appendChild(o);
    });
    el.select.value = model;
    if (mode === 'image') fillSelect();
    updateStatus();
    if (installed.includes(model) && warmed !== model) { warmed = model; fetch('/api/warm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }).catch(() => {}); }
  }
  el.select.onchange = () => { if (mode === 'image') { ckpt = el.select.value; localStorage.setItem('offlineai.ckpt', ckpt); applyDefaults(); return; } model = el.select.value; localStorage.setItem('offlineai.model', model); warmed = ''; refreshModels(); };

  /* ---------- Chat ---------- */
  function setBusy(b) {
    generating = b; el.input.disabled = b; el.send.hidden = b; el.stop.hidden = !b;
    if (!b) el.input.focus();
  }
  function newChat() {
    if (generating) return;
    const c = active();
    if (c && !c.messages.length) return renderAll();
    const n = { id: uid(), title: 'New chat', messages: [] };
    chats.unshift(n); activeId = n.id; save(); renderAll(); el.input.focus();
  }

  async function send(text) {
    text = text.trim();
    if (!text || generating) return;
    if (mode === 'image') return sendImage(text);
    let c = active();
    if (!c) { newChat(); c = active(); }
    if (!c.messages.length) c.title = text.replace(/\s+/g, ' ').slice(0, 40);
    c.messages.push({ role: 'user', content: text });
    const reply = { role: 'assistant', content: '' };
    save(); renderHistory(); el.empty.style.display = 'none';
    el.messages.appendChild(msgNode(c.messages[c.messages.length - 1]));
    const node = msgNode(reply), body = node.querySelector('.body');
    body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    el.messages.appendChild(node); scrollDown(true);
    el.input.value = ''; autosize(); setBusy(true);

    controller = new AbortController();
    let pending = false;
    const paint = () => { pending = false; body.innerHTML = md(reply.content); scrollDown(); };
    const history = c.messages.filter(m => !m.error && !m.image && !m.img).map(m => ({ role: m.role, content: m.content })).slice(-20);
    const sys = (localStorage.getItem('offlineai.system') || '').trim();
    if (sys) history.unshift({ role: 'system', content: sys });
    let failure = null;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: history }), signal: controller.signal });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Request failed (${r.status}).`); }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '';
      const handle = line => {
        if (!line.trim()) return;
        let j; try { j = JSON.parse(line); } catch { return; }
        if (j.error) throw new Error(j.error);
        if (j.message?.content) { reply.content += j.message.content; if (!pending) { pending = true; requestAnimationFrame(paint); } }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n'); buf = parts.pop();
        parts.forEach(handle);
      }
      handle(buf);
    } catch (e) {
      if (e.name !== 'AbortError') failure = e.message === 'Failed to fetch' ? 'Cannot reach the Offline AI server. Is "npm start" still running?' : e.message;
    }
    controller = null;
    paint();
    if (reply.content) c.messages.push(reply);
    else if (!failure) body.closest('.msg').remove();
    if (failure) { const err = { role: 'assistant', content: failure, error: true }; c.messages.push(err); node.replaceWith(msgNode(err)); }
    else if (reply.content) body.innerHTML = md(reply.content);
    save(); setBusy(false); renderChat();
    if (failure) refreshModels();
  }

  /* ---------- Image mode ---------- */
  async function refreshImage() {
    try {
      const r = await fetch('/api/image/models'), d = await r.json();
      if (!r.ok) throw new Error();
      ckpts = d.models; comfyOk = true; localStorage.setItem('offlineai.images', '1'); $('modeSeg').hidden = false;
    } catch { ckpts = []; comfyOk = false; }
    fillSelect(); updateStatus();
  }
  function fillSelect() {
    if (mode !== 'image') return;
    el.select.innerHTML = '';
    (ckpts.length ? ckpts : ['No checkpoints found']).forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; el.select.appendChild(o); });
    if (!ckpts.includes(ckpt)) ckpt = ckpts[0] || '';
    el.select.value = ckpt; applyDefaults();
  }
  function applyDefaults() {
    const turbo = /turbo|lightning|lcm/i.test(ckpt);
    $('imgSteps').value = turbo ? 2 : 20; $('imgCfg').value = turbo ? 1 : 7;
  }
  function updateStatus() {
    if (mode === 'image') {
      if (!comfyOk) return setStatus('off', 'ComfyUI Offline');
      return ckpts.length ? setStatus('ok', 'ComfyUI Connected') : setStatus('nomodel', 'No Checkpoint Found');
    }
    setStatus(ollamaState, { ok: 'Ollama Connected', nomodel: 'No Model Installed', off: 'Ollama Offline' }[ollamaState]);
    const nt = $('notice'), tips = { off: 'Ollama is not running. Install it from ollama.com and start it, then this page connects automatically.', nomodel: 'No model installed yet. Open PowerShell and run: ollama pull gemma3:4b' };
    nt.hidden = ollamaState === 'ok'; nt.textContent = tips[ollamaState] || '';
  }
  function setMode(m) {
    if (generating) return;
    mode = m;
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('imgOpts').hidden = m !== 'image';
    el.input.placeholder = m === 'image' ? 'Describe an image…' : 'Message your local AI…';
    $('attachBtn').hidden = m !== 'image'; if (m !== 'image') detach();
    if (m === 'image') { fillSelect(); updateStatus(); refreshImage(); } else refreshModels();
  }
  async function sendImage(text) {
    let c = active();
    if (!c) { newChat(); c = active(); }
    if (!c.messages.length) c.title = '🖼 ' + text.replace(/\s+/g, ' ').slice(0, 38);
    c.messages.push({ role: 'user', content: (attached ? '✏️ ' : '') + text, img: true });
    save(); renderHistory(); el.empty.style.display = 'none';
    el.messages.appendChild(msgNode(c.messages[c.messages.length - 1]));
    const node = document.createElement('div'); node.className = 'msg ai';
    node.innerHTML = '<svg class="logo av"><use href="#logo"/></svg><div class="body"><span class="typing"><i></i><i></i><i></i></span> <span class="wait">Generating image…</span></div>';
    el.messages.appendChild(node); scrollDown(true);
    el.input.value = ''; autosize(); setBusy(true);
    const t0 = Date.now(), wait = node.querySelector('.wait');
    const timer = setInterval(() => wait.textContent = `Generating image… ${Math.floor((Date.now() - t0) / 1000)}s (CPU can take minutes)`, 1000);
    controller = new AbortController();
    let url = null, failure = null;
    try {
      const size = +$('imgSize').value; let width = size, height = size, extra = {};
      if (attached) {
        const k = size / Math.max(attached.w, attached.h);
        width = Math.max(256, Math.round(attached.w * k / 64) * 64); height = Math.max(256, Math.round(attached.h * k / 64) * 64);
        extra = { image: attached.data, denoise: +$('imgStr').value };
      }
      const r = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ prompt: text, checkpoint: ckpt, width, height, steps: +$('imgSteps').value, cfg: +$('imgCfg').value, ...extra }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status}).`);
      url = d.url; if (attached) detach();
    } catch (e) {
      if (e.name !== 'AbortError') failure = e.message === 'Failed to fetch' ? 'Cannot reach the Offline AI server. Is "npm start" still running?' : e.message;
    }
    clearInterval(timer); controller = null;
    const m = url ? { role: 'assistant', content: text, image: url } : failure ? { role: 'assistant', content: failure, error: true } : null;
    if (m) { c.messages.push(m); node.replaceWith(msgNode(m)); } else node.remove();
    save(); setBusy(false); scrollDown(true);
    if (failure) refreshImage();
  }
  document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  function attachSrc(src) {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 768 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h);
      attached = { data: cv.toDataURL('image/jpeg', 0.92), w, h };
      $('chipImg').src = attached.data; $('chip').hidden = false; $('strLbl').hidden = false;
      el.input.placeholder = 'Describe the change…'; el.input.focus();
    };
    im.src = src;
  }
  function detach() {
    attached = null; $('chip').hidden = true; $('strLbl').hidden = true; $('fileIn').value = '';
    el.input.placeholder = mode === 'image' ? 'Describe an image…' : 'Message your local AI…';
  }
  $('attachBtn').onclick = () => $('fileIn').click();
  $('fileIn').onchange = e => { const f = e.target.files[0]; if (f) attachSrc(URL.createObjectURL(f)); };
  $('chipX').onclick = detach;
  el.messages.addEventListener('click', e => {
    if (!e.target.classList.contains('edit') || generating) return;
    if (mode !== 'image') setMode('image');
    attachSrc(e.target.dataset.src);
  });

  /* ---------- Events ---------- */
  function autosize() { el.input.style.height = 'auto'; el.input.style.height = Math.min(el.input.scrollHeight, 200) + 'px'; }
  el.input.addEventListener('input', autosize);
  el.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(el.input.value); } });
  el.send.onclick = () => send(el.input.value);
  el.stop.onclick = () => controller && controller.abort();
  $('newChat').onclick = () => { newChat(); el.app.classList.remove('open'); };
  $('clearAll').onclick = () => { if (!generating && chats.length && confirm('Delete all chats on this device?')) { chats = []; activeId = null; save(); renderAll(); } };
  $('menuBtn').onclick = () => el.app.classList.add('open');
  $('scrim').onclick = () => el.app.classList.remove('open');
  document.querySelectorAll('.card').forEach(b => b.onclick = () => { el.input.value = b.dataset.prompt; autosize(); el.input.focus(); });
  el.messages.addEventListener('click', e => {
    if (!e.target.classList.contains('copy')) return;
    const code = e.target.closest('.codeblock').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => { e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy', 1500); });
  });

  $('search').oninput = renderHistory;
  $('themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; localStorage.setItem('offlineai.theme', t); };
  $('settingsBtn').onclick = () => { $('sysText').value = localStorage.getItem('offlineai.system') || ''; $('settings').showModal(); };
  $('sysCancel').onclick = () => $('settings').close();
  $('sysSave').onclick = () => { localStorage.setItem('offlineai.system', $('sysText').value); $('settings').close(); };
  $('exportBtn').onclick = () => {
    const c = active(); if (!c || !c.messages.length) return;
    const text = `# ${c.title}\n\n` + c.messages.filter(m => !m.error).map(m => `**${m.role === 'user' ? 'You' : 'Offline AI'}:**\n\n${m.content}`).join('\n\n---\n\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = c.title.replace(/[^\w-]+/g, '_') + '.md'; a.click(); URL.revokeObjectURL(a.href);
  };
  el.messages.addEventListener('click', e => {
    const b = e.target.closest('.act'); if (!b) return;
    const c = active(), i = [...el.messages.children].indexOf(b.closest('.msg'));
    if (b.dataset.a === 'copy') navigator.clipboard.writeText(c.messages[i].content).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); });
    else if (b.dataset.a === 'regen' && !generating) {
      while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
      const last = c.messages.pop(); if (!last) return;
      save(); renderChat(); if (mode !== 'chat') setMode('chat'); send(last.content);
    }
  });

  if (!active()) activeId = chats[0]?.id || null;
  $('modeSeg').hidden = !localStorage.getItem('offlineai.images');
  renderAll(); refreshModels().then(refreshImage); setInterval(() => { refreshModels(); if (mode === 'image' || $('modeSeg').hidden) refreshImage(); }, 10000);
})();
