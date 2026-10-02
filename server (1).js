const express = require('express');
const path = require('path');

const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const OFFLINE_MSG = 'Ollama is not running. Start the Ollama app (or run "ollama serve") and try again.';

app.get('/api/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return res.status(502).json({ error: `Ollama returned status ${r.status}.` });
    const data = await r.json();
    res.json({ models: (data.models || []).map(m => ({ name: m.name, size: m.size })) });
  } catch {
    res.status(503).json({ error: OFFLINE_MSG, code: 'offline' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body || {};
  const valid = Array.isArray(messages) && messages.length > 0 && messages.every(m =>
    m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string');
  if (typeof model !== 'string' || !model.trim() || !valid) {
    return res.status(400).json({ error: 'Invalid request: "model" and a non-empty "messages" array are required.' });
  }

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { num_ctx: 8192 } }),
      signal: ac.signal,
    });

    if (!r.ok) {
      let detail = '';
      try { detail = (await r.json()).error || ''; } catch {}
      if (r.status === 404) {
        return res.status(404).json({ error: `Model "${model}" is not installed. Run: ollama run ${model}`, code: 'no_model' });
      }
      return res.status(502).json({ error: detail || `Ollama returned status ${r.status}.` });
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (err) {
    if (ac.signal.aborted) return;
    if (!res.headersSent) {
      return res.status(503).json({ error: OFFLINE_MSG, code: 'offline' });
    }
    res.write(JSON.stringify({ error: 'The connection to Ollama was interrupted.' }) + '\n');
    res.end();
  }
});

/* ---------- Image generation via ComfyUI ---------- */
const COMFY = (process.env.COMFY_HOST || 'http://127.0.0.1:8188').replace(/\/$/, '');
const COMFY_OFFLINE = 'ComfyUI is not running. Start it (run_cpu.bat) and open it once at http://127.0.0.1:8188.';
const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

app.get('/api/image/models', async (req, res) => {
  try {
    const r = await fetch(`${COMFY}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    const d = await r.json();
    res.json({ models: d.CheckpointLoaderSimple.input.required.ckpt_name[0] });
  } catch { res.status(503).json({ error: COMFY_OFFLINE, code: 'offline' }); }
});

app.post('/api/image', async (req, res) => {
  const b = req.body || {};
  if (typeof b.prompt !== 'string' || !b.prompt.trim() || typeof b.checkpoint !== 'string' || !b.checkpoint) {
    return res.status(400).json({ error: 'A prompt and a checkpoint are required.' });
  }
  const width = Math.round(num(b.width, 512, 256, 1024) / 64) * 64;
  const height = Math.round(num(b.height, 512, 256, 1024) / 64) * 64;
  const wf = {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: b.checkpoint } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: b.prompt, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: String(b.negative || 'blurry, low quality, distorted'), clip: ['1', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    5: { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
        seed: Math.floor(Math.random() * 2 ** 32), steps: Math.round(num(b.steps, 20, 1, 60)), cfg: num(b.cfg, 7, 1, 20),
        sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    7: { class_type: 'SaveImage', inputs: { filename_prefix: 'OfflineAI', images: ['6', 0] } },
  };

  const ac = new AbortController();
  let pid = null;
  res.on('close', () => {
    if (res.writableFinished) return;
    ac.abort();
    if (pid) fetch(`${COMFY}/interrupt`, { method: 'POST' }).catch(() => {});
  });

  try {
    const r = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }), signal: ac.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: d.error?.message || 'ComfyUI rejected the request. Check the checkpoint name.' });
    pid = d.prompt_id;
    const end = Date.now() + 30 * 60 * 1000;
    while (Date.now() < end) {
      await new Promise(s => setTimeout(s, 1500));
      if (ac.signal.aborted) return;
      const h = await (await fetch(`${COMFY}/history/${pid}`, { signal: ac.signal })).json();
      const e = h[pid];
      if (!e) continue;
      if (e.status?.status_str === 'error') return res.status(500).json({ error: 'ComfyUI failed to generate the image. Check its console window.' });
      const img = Object.values(e.outputs || {}).flatMap(o => o.images || [])[0];
      if (img) {
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '' });
        return res.json({ url: `/api/image/view?${q}` });
      }
    }
    res.status(504).json({ error: 'Image generation timed out.' });
  } catch {
    if (!ac.signal.aborted) res.status(503).json({ error: COMFY_OFFLINE });
  }
});

app.get('/api/image/view', async (req, res) => {
  try {
    const q = new URLSearchParams({ filename: String(req.query.filename || ''), subfolder: String(req.query.subfolder || ''), type: 'output' });
    const r = await fetch(`${COMFY}/view?${q}`);
    if (!r.ok) return res.sendStatus(404);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch { res.sendStatus(503); }
});

app.listen(PORT, () => {
  console.log(`Offline AI running at http://localhost:${PORT}`);
  console.log(`Using Ollama at ${OLLAMA}`);
});
