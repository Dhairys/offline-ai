# Offline AI

A private, local AI assistant that runs **Google Gemma 3 4B** on your own computer through **Ollama**. No cloud AI API, no API key, no data leaving your device.

```
Browser → Express backend → Ollama → Gemma 3 4B → Express → Browser
```

**Stack:** HTML/CSS/vanilla JS frontend · Node.js + Express backend · Ollama at `http://127.0.0.1:11434` · model `gemma3:4b`

## Features
- Streaming responses, Markdown, bold, inline code, copyable code blocks
- Stop-generation button, auto-growing composer (Enter = send, Shift+Enter = newline)
- Chat history in browser `localStorage`, auto-named chats, delete/clear
- Model dropdown filled from Ollama's `/api/tags`
- Live status: Ollama Connected / Ollama Offline / No Model Installed
- Responsive: desktop, tablet, mobile (sidebar behind a menu button)

## Setup

### 1. Install Ollama
Download the Windows installer from <https://ollama.com/download>, run it, and let Ollama start in the background (tray icon).

### 2. Install Gemma 3 4B
```powershell
ollama run gemma3:4b
```
The first run downloads the model (about 3 GB). Type `/bye` once it loads.

### 3. Install Node.js
Install the LTS version (18 or newer) from <https://nodejs.org>. Check with `node -v`.

### 4. Run the app
```powershell
npm install
npm start
```

### 5. Open
<http://localhost:3000>

## Example hardware
Tested target machine:
- Intel Core i5-12400
- 16 GB RAM
- Intel UHD 730 (integrated graphics)
- Windows

This setup runs Gemma 3 4B on the CPU. Expect usable but modest speed; shorter prompts and chats respond faster. Close memory-heavy apps while generating.

## Configuration
| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` |

PowerShell example: `$env:PORT=4000; npm start`

## API
- `GET /api/models` – lists installed models from Ollama
- `POST /api/chat` – body `{ "model": "gemma3:4b", "messages": [{ "role": "user", "content": "Hello" }] }`; streams newline-delimited JSON from Ollama

## Privacy and GitHub
Ollama runs the model locally and stores model files in its own folder (on Windows: `%USERPROFILE%\.ollama`). **Do not commit model files to GitHub.** They are large, and this project never needs them in the repository. The `.gitignore` already excludes `node_modules`, `.env`, and common model formats. Chats live only in your browser's `localStorage`.

## Image generation (optional, ComfyUI)
Offline AI can generate images through a local [ComfyUI](https://www.comfy.org) install. Nothing leaves your computer.

1. Start ComfyUI (for your hardware, `run_cpu.bat` with `--cpu`). It must listen on `http://127.0.0.1:8188`.
2. Put a `.safetensors` checkpoint (for example SD Turbo) in `ComfyUI\models\checkpoints`.
3. In Offline AI, click **Image** at the top, pick the checkpoint, set size/steps/CFG, and describe an image.

Turbo models default to 2 steps and CFG 1; other models default to 20 steps and CFG 7. CPU generation can take minutes. Generated images are saved in ComfyUI's `output` folder. Use `COMFY_HOST` to change the ComfyUI address.
