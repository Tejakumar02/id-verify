/**
 * aiProvider.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Swappable AI adapter. Set AI_PROVIDER in .env to switch between:
 *   anthropic | openai | gemini | ollama
 *
 * All providers receive the same image + prompt and must return
 * the same structured JSON report shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require("axios");

// ── Shared system prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a forensic document examiner specializing in identity document authentication.
Analyze the provided ID document image for signs of forgery, tampering, or manipulation.

Return ONLY a valid JSON object — no markdown fences, no explanation outside JSON.

{
  "documentType": "string",
  "overallRisk": "GENUINE" | "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "CRITICAL",
  "confidenceScore": 0-100,
  "summary": "1-2 sentence executive summary",
  "checks": [
    { "category": "string", "name": "string", "status": "PASS"|"WARN"|"FAIL"|"INFO", "detail": "string" }
  ],
  "redFlags": ["string"],
  "positiveSignals": ["string"],
  "recommendations": ["string"],
  "metaAnalysis": {
    "imageQuality": "GOOD"|"ACCEPTABLE"|"POOR",
    "imageQualityNote": "string",
    "analysisLimitations": "string"
  }
}

Run ALL of these checks (one entry each in the checks array):
1. VISUAL INTEGRITY    – Font consistency, text alignment, spacing irregularities
2. SECURITY FEATURES   – Holograms, watermarks, microprint, color-shifting ink
3. PHOTO ANALYSIS      – Photo placement, border integrity, photo substitution signs
4. TEXT CONSISTENCY    – Name format, date formats, ID number patterns/checksums
5. LAYOUT AUTHENTICITY – Standard layout for claimed document type, margin consistency
6. DIGITAL ARTIFACTS   – Pixelation, JPEG artifacts around text, copy-paste evidence
7. COLOR ANALYSIS      – Color consistency, gradient patterns, ink distribution
8. EDGE & BORDER CHECK – Document edges, corner wear, border security features
9. METADATA CONTEXT    – What the image context and quality suggest
10. OVERALL ASSESSMENT – Final holistic judgment

Risk levels:
  GENUINE     → No red flags, appears authentic
  LOW_RISK    → Minor anomalies, likely genuine
  MEDIUM_RISK → Several concerns, recommend manual verification
  HIGH_RISK   → Multiple red flags, likely tampered
  CRITICAL    → Strong forgery evidence

If the image is not an ID document, set overallRisk to "INFO" and explain in summary.`;

// ── Parse raw text → JSON (strips accidental markdown fences) ─────────────────
function parseJSON(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeWithAnthropic(base64Image, mimeType) {
  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-opus-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image } },
            { type: "text", text: "Analyze this ID document for authenticity. Return only the JSON report." }
          ]
        }
      ]
    },
    {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    }
  );
  const raw = res.data.content.map(b => b.text || "").join("");
  return parseJSON(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENAI  (GPT-4o has vision)
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeWithOpenAI(base64Image, mimeType) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            { type: "text", text: "Analyze this ID document for authenticity. Return only the JSON report." }
          ]
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
  return parseJSON(res.data.choices[0].message.content);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE GEMINI  (free tier: 15 req/min, 1500 req/day)
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeWithGemini(base64Image, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await axios.post(url, {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: "Analyze this ID document for authenticity. Return only the JSON report." }
        ]
      }
    ],
    generationConfig: { maxOutputTokens: 2000 }
  });
  const raw = res.data.candidates[0].content.parts.map(p => p.text || "").join("");
  return parseJSON(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA  (local — runs on your machine, 100% free, no internet needed)
// Requires: `ollama pull llava` before use
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeWithOllama(base64Image) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llava";
  const res = await axios.post(`${base}/api/generate`, {
    model,
    prompt: `${SYSTEM_PROMPT}\n\nAnalyze this ID document for authenticity. Return only the JSON report.`,
    images: [base64Image],
    stream: false
  });
  return parseJSON(res.data.response);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — picks provider from .env
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeDocument(base64Image, mimeType) {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  switch (provider) {
    case "anthropic": return analyzeWithAnthropic(base64Image, mimeType);
    case "openai":    return analyzeWithOpenAI(base64Image, mimeType);
    case "gemini":    return analyzeWithGemini(base64Image, mimeType);
    case "ollama":    return analyzeWithOllama(base64Image, mimeType);
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}". Use: anthropic | openai | gemini | ollama`);
  }
}

module.exports = { analyzeDocument };
