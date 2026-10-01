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
      body: JSON.stringify({ model, messages, stream: true }),
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

app.listen(PORT, () => {
  console.log(`Offline AI running at http://localhost:${PORT}`);
  console.log(`Using Ollama at ${OLLAMA}`);
});
