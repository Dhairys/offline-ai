# Quick setup and troubleshooting

## Five-minute setup (Windows)
1. Install Ollama: <https://ollama.com/download>
2. `ollama run gemma3:4b` (wait for download, then `/bye`)
3. Install Node.js LTS: <https://nodejs.org>
4. In the project folder: `npm install` then `npm start`
5. Open <http://localhost:3000>

## Status indicator
| Status | Meaning | Fix |
|---|---|---|
| Ollama Connected | Ready | None |
| Ollama Offline | Server cannot reach Ollama | Start Ollama from the Start menu, or run `ollama serve` |
| No Model Installed | Ollama runs but has no models | `ollama pull gemma3:4b` |

## Common problems
- **"Model not installed"**: run `ollama pull gemma3:4b`, then reload.
- **Port 3000 in use**: `$env:PORT=4000; npm start`
- **Port 11434 in use / `ollama serve` fails**: Ollama is probably already running; that is fine.
- **Slow replies**: expected on CPU-only machines. Start a new chat for shorter context.
- **Check Ollama directly**: open <http://127.0.0.1:11434/api/tags> in a browser.
- **Reset chats**: use "Clear all chats", or clear site data for `localhost:3000`.
