# 🔍 ID·VERIFY — Document Authenticity Engine

AI-powered identity document forgery detection. Upload an ID image → get a structured fraud risk report in seconds.

---

## 📁 Project Structure

```
id-verify/
├── backend/
│   ├── server.js          # Express REST API
│   ├── aiProvider.js      # Swappable AI adapter (Anthropic / OpenAI / Gemini / Ollama)
│   ├── package.json
│   └── .env.example       # Copy this to .env and fill in your key
│
├── frontend/
│   ├── src/
│   │   ├── App.js         # Full React UI
│   │   └── index.js       # Entry point
│   ├── public/
│   │   └── index.html
│   └── package.json
│
└── README.md
```

---

## 🚀 How to Run

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- An API key for at least one AI provider (see options below)

---

### Step 1 — Set up the Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in your chosen AI provider:

```env
# Pick ONE provider and uncomment it:

AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OR
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# OR
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# OR (fully local, no key needed)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

Start the backend:

```bash
npm start
# → Running at http://localhost:5000
```

---

### Step 2 — Set up the Frontend

Open a **new terminal**:

```bash
cd frontend
npm install
npm start
# → Opens http://localhost:3000
```

The frontend proxies `/api/*` calls to `localhost:5000` automatically (configured in `package.json`).

---

### Step 3 — Use It

1. Open **http://localhost:3000**
2. Drag & drop or click to upload an ID document image
3. Wait 5–10 seconds
4. View the full fraud detection report

---

## 🔑 AI Provider Options

| Provider | Cost | Signup |
|---|---|---|
| **Anthropic Claude** | Pay-per-use | https://console.anthropic.com |
| **OpenAI GPT-4o** | Pay-per-use | https://platform.openai.com |
| **Google Gemini** | Free tier (1500 req/day) | https://aistudio.google.com |
| **Ollama** (local) | 100% free | https://ollama.com |

### Using Ollama (Free & Local)
```bash
# 1. Install Ollama from https://ollama.com
# 2. Pull a vision model:
ollama pull llava
# 3. Set in .env:
AI_PROVIDER=ollama
```

---

## 📡 API Reference

### `GET /health`
Returns server status and current AI provider.

```json
{
  "status": "ok",
  "provider": "anthropic",
  "maxFileSizeMB": 10,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### `POST /api/analyze`
Accepts a multipart form upload and returns a fraud detection report.

**Request:**
```
Content-Type: multipart/form-data
Field: document (image file)
```

**Response:**
```json
{
  "success": true,
  "report": {
    "documentType": "Passport",
    "overallRisk": "MEDIUM_RISK",
    "confidenceScore": 72,
    "summary": "...",
    "checks": [
      { "category": "...", "name": "...", "status": "PASS|WARN|FAIL|INFO", "detail": "..." }
    ],
    "redFlags": ["..."],
    "positiveSignals": ["..."],
    "recommendations": ["..."],
    "metaAnalysis": {
      "imageQuality": "GOOD",
      "imageQualityNote": "...",
      "analysisLimitations": "..."
    },
    "_meta": {
      "filename": "passport.jpg",
      "fileSizeKB": "245.3",
      "dimensions": "1200x800",
      "aiProvider": "anthropic",
      "analyzedAt": "2025-01-01T00:00:00.000Z",
      "durationMs": 4231
    }
  }
}
```

---

## 🔍 Forensic Checks Performed

| # | Check | What it looks for |
|---|---|---|
| 1 | Visual Integrity | Font consistency, text alignment, spacing |
| 2 | Security Features | Holograms, watermarks, microprint |
| 3 | Photo Analysis | Photo substitution, border integrity |
| 4 | Text Consistency | Name/date formats, ID number patterns |
| 5 | Layout Authenticity | Standard layout for document type |
| 6 | Digital Artifacts | Pixelation, JPEG artifacts, copy-paste marks |
| 7 | Color Analysis | Color consistency, ink distribution |
| 8 | Edge & Border Check | Document borders, corner wear |
| 9 | Metadata Context | Image quality and context signals |
| 10 | Overall Assessment | Holistic final judgment |

---

## ⚠️ Disclaimer

This tool is for **preliminary screening only**. Results are AI-generated and not legally binding. Always follow up suspicious results with manual verification by trained document examiners.

---

## 🏗️ Architecture

```
Browser (React)
     │
     │  POST /api/analyze  (multipart image)
     ▼
Express Backend
     │  1. Multer — receives & validates file
     │  2. Sharp  — checks image integrity & dimensions
     │  3. Base64 — converts for AI consumption
     ▼
aiProvider.js  (swap provider via .env)
     │
     ├── Anthropic Claude Vision
     ├── OpenAI GPT-4o
     ├── Google Gemini 1.5 Pro
     └── Ollama (local)
     │
     ▼
Structured JSON Report → Frontend renders report UI
```
