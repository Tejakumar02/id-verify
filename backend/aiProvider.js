/**
 * aiProvider.js
 * Swappable AI adapter: anthropic | openai | gemini | ollama
 */

const axios = require("axios");
const sharp = require("sharp");

const CLOUD_SYSTEM = `You are a forensic document examiner. Analyze ID documents for forgery.
Return ONLY valid JSON, no markdown, no extra text.`;

const CLOUD_PROMPT = `Analyze this ID document image for authenticity and forgery signs.
Return ONLY this exact JSON structure with your findings filled in:
{
  "documentType": "string",
  "overallRisk": "GENUINE",
  "confidenceScore": 75,
  "summary": "brief summary",
  "checks": [
    {"category":"Visual","name":"Font Integrity","status":"PASS","detail":"explanation"},
    {"category":"Visual","name":"Photo Analysis","status":"PASS","detail":"explanation"},
    {"category":"Layout","name":"Layout Check","status":"PASS","detail":"explanation"},
    {"category":"Security","name":"Security Features","status":"INFO","detail":"explanation"},
    {"category":"Digital","name":"Digital Artifacts","status":"PASS","detail":"explanation"},
    {"category":"Text","name":"Text Consistency","status":"PASS","detail":"explanation"},
    {"category":"Color","name":"Color Analysis","status":"PASS","detail":"explanation"},
    {"category":"Border","name":"Edge Check","status":"PASS","detail":"explanation"},
    {"category":"Overall","name":"Overall Assessment","status":"PASS","detail":"explanation"}
  ],
  "redFlags": [],
  "positiveSignals": [],
  "recommendations": [],
  "metaAnalysis": {
    "imageQuality": "GOOD",
    "imageQualityNote": "note",
    "analysisLimitations": "note"
  }
}
overallRisk must be one of: GENUINE LOW_RISK MEDIUM_RISK HIGH_RISK CRITICAL
status must be one of: PASS WARN FAIL INFO`;

// ─── Resize image to small size so Ollama doesn't crash ──────────────────────
// Root cause: Ollama's moondream/llava crashes when base64 image is too large.
// Fix: resize to max 512px wide JPEG at low quality before sending.
async function resizeForOllama(base64Image) {
  const inputBuffer = Buffer.from(base64Image, "base64");
  const resized = await sharp(inputBuffer)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  const result = resized.toString("base64");
  console.log(`[Ollama] Image resized: ${(inputBuffer.length/1024).toFixed(1)}KB -> ${(resized.length/1024).toFixed(1)}KB`);
  return result;
}

// ─── JSON parser ──────────────────────────────────────────────────────────────
function parseJSON(raw) {
  if (!raw || !raw.trim()) throw new Error("Empty response from AI");
  let clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("NO_JSON");
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch(e) {
    throw new Error("BAD_JSON: " + e.message);
  }
}

// ─── Build report from plain text ─────────────────────────────────────────────
function buildReportFromText(plainText) {
  console.log("[Ollama] Building report from plain text...");
  const lower = plainText.toLowerCase();

  let overallRisk = "LOW_RISK";
  let score = 55;

  if (lower.includes("fake") || lower.includes("forg") || lower.includes("tamper") ||
      lower.includes("manipulat") || lower.includes("suspicious") || lower.includes("altered")) {
    overallRisk = "HIGH_RISK"; score = 70;
  } else if (lower.includes("genuine") || lower.includes("authentic") ||
             lower.includes("real") || lower.includes("legitimate")) {
    overallRisk = "GENUINE"; score = 65;
  } else if (lower.includes("unclear") || lower.includes("cannot determine")) {
    overallRisk = "MEDIUM_RISK"; score = 45;
  }

  const sentences = plainText.match(/[^.!?]+[.!?]+/g) || [];
  const summary = sentences.slice(0, 2).join(" ").trim() || plainText.substring(0, 150);
  const checkStatus = overallRisk === "GENUINE" ? "PASS" : overallRisk === "HIGH_RISK" ? "FAIL" : "WARN";

  return {
    documentType: "Identity Document",
    overallRisk, confidenceScore: score,
    summary: summary || "Document analyzed by local AI model.",
    checks: [
      { category:"Visual",   name:"Font Integrity",    status:"INFO", detail:"Assessed via local model" },
      { category:"Visual",   name:"Photo Analysis",    status:"INFO", detail:"Photo region examined" },
      { category:"Layout",   name:"Layout Check",      status:"INFO", detail:"Layout compared to known formats" },
      { category:"Security", name:"Security Features", status:"INFO", detail:"Visible security features noted" },
      { category:"Digital",  name:"Digital Artifacts", status:"INFO", detail:"Image examined for artifacts" },
      { category:"Text",     name:"Text Consistency",  status:"INFO", detail:"Text fields reviewed" },
      { category:"Color",    name:"Color Analysis",    status:"INFO", detail:"Color distribution assessed" },
      { category:"Border",   name:"Edge Check",        status:"INFO", detail:"Document borders inspected" },
      { category:"Overall",  name:"Overall Assessment",status:checkStatus, detail: summary }
    ],
    redFlags:        overallRisk === "HIGH_RISK" ? ["Potential tampering indicators found"] : [],
    positiveSignals: overallRisk === "GENUINE"   ? ["Document features appear consistent"] : [],
    recommendations: ["Manual verification recommended — local AI model used"],
    metaAnalysis: {
      imageQuality: "ACCEPTABLE",
      imageQualityNote: "Assessed by local vision model",
      analysisLimitations: "Local Ollama model used. For detailed forensic analysis, use a cloud API (Gemini/Anthropic)."
    }
  };
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
async function analyzeWithOllama(base64Image) {
  const base  = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = (process.env.OLLAMA_MODEL || "moondream").toLowerCase();
  console.log(`[Ollama] model=${model}`);

  // CRITICAL FIX: resize image before sending to prevent Ollama crash
  let smallImage;
  try {
    smallImage = await resizeForOllama(base64Image);
  } catch(e) {
    console.log("[Ollama] Resize failed, using original:", e.message);
    smallImage = base64Image;
  }

  // ── Attempt 1: JSON output ────────────────────────────────────────────────
  console.log("[Ollama] Attempt 1: requesting JSON...");
  try {
    const res = await axios.post(`${base}/api/generate`, {
      model,
      prompt: `You are analyzing an ID document photo. Is it real or fake? Reply ONLY with valid JSON:\n{"documentType":"type here","overallRisk":"GENUINE","confidenceScore":70,"summary":"your summary here","checks":[{"category":"Visual","name":"Photo Analysis","status":"PASS","detail":"your finding"},{"category":"Overall","name":"Overall Assessment","status":"PASS","detail":"your finding"}],"redFlags":[],"positiveSignals":[],"recommendations":[],"metaAnalysis":{"imageQuality":"GOOD","imageQualityNote":"note","analysisLimitations":"Local model"}}`,
      images: [smallImage],
      stream: false,
      options: { temperature: 0.1, num_predict: 500, num_ctx: 1024 }
    }, { timeout: 120000 });

    const raw = res.data.response || "";
    console.log("[Ollama] Attempt 1 response:", raw.substring(0, 150));

    if (raw.includes("{") && raw.includes("}")) {
      try {
        return parseJSON(raw);
      } catch(e) {
        console.log("[Ollama] JSON parse failed:", e.message);
      }
    }
  } catch(e) {
    console.log("[Ollama] Attempt 1 failed:", e.response?.data?.error || e.message);
  }

  // ── Attempt 2: Plain text → build report ─────────────────────────────────
  console.log("[Ollama] Attempt 2: plain text description...");
  try {
    const res2 = await axios.post(`${base}/api/generate`, {
      model,
      prompt: "Describe this image. Is it an ID document? Does it look real or fake? What do you see?",
      images: [smallImage],
      stream: false,
      options: { temperature: 0.2, num_predict: 200, num_ctx: 1024 }
    }, { timeout: 90000 });

    const text = res2.data.response || "";
    console.log("[Ollama] Attempt 2 response:", text.substring(0, 150));
    if (text.trim()) return buildReportFromText(text);
  } catch(e) {
    console.log("[Ollama] Attempt 2 failed:", e.response?.data?.error || e.message);
  }

  // ── Attempt 3: No image — just return a safe default report ──────────────
  console.log("[Ollama] All attempts failed. Returning safe default report.");
  return {
    documentType: "Identity Document",
    overallRisk: "MEDIUM_RISK",
    confidenceScore: 30,
    summary: "Local AI model could not fully process this image. Manual verification required.",
    checks: [
      { category:"System", name:"AI Processing", status:"WARN",
        detail:"Local model (moondream/llava) was unable to analyze this image fully. This is a known limitation of lightweight local models with certain image formats." },
      { category:"Overall", name:"Overall Assessment", status:"WARN",
        detail:"Could not complete automated analysis. Please verify document manually or switch to a cloud AI provider." }
    ],
    redFlags: [],
    positiveSignals: [],
    recommendations: [
      "Switch to Gemini or Anthropic API for reliable analysis",
      "Perform manual document verification",
      "Try a different image format (JPG instead of WEBP/PNG)"
    ],
    metaAnalysis: {
      imageQuality: "UNKNOWN",
      imageQualityNote: "Could not assess — local model processing failed",
      analysisLimitations: "Local Ollama model failed to process image. This is common with moondream on certain image types. Recommend using cloud API."
    }
  };
}

// ─── Anthropic ────────────────────────────────────────────────────────────────
async function analyzeWithAnthropic(base64Image, mimeType) {
  const res = await axios.post("https://api.anthropic.com/v1/messages", {
    model: "claude-opus-4-5", max_tokens: 2000,
    system: CLOUD_SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image } },
      { type: "text", text: CLOUD_PROMPT }
    ]}]
  }, { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } });
  return parseJSON(res.data.content.map(b => b.text || "").join(""));
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────
async function analyzeWithOpenAI(base64Image, mimeType) {
  const res = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o", max_tokens: 2000,
    messages: [
      { role: "system", content: CLOUD_SYSTEM },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        { type: "text", text: CLOUD_PROMPT }
      ]}
    ]
  }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } });
  return parseJSON(res.data.choices[0].message.content);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function analyzeWithGemini(base64Image, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(url, {
        system_instruction: { parts: [{ text: CLOUD_SYSTEM }] },
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: CLOUD_PROMPT }
        ]}],
        generationConfig: { maxOutputTokens: 2000 }
      });
      return parseJSON(res.data.candidates[0].content.parts.map(p => p.text || "").join(""));
    } catch (err) {
      if (err.response?.status === 429 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt === 1 ? 5000 : 15000));
        continue;
      }
      if (err.response?.status === 429) throw new Error("Gemini rate limit. Wait 60s and retry.");
      throw err;
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function analyzeDocument(base64Image, mimeType) {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  console.log(`[Provider] ${provider}`);
  switch (provider) {
    case "anthropic": return analyzeWithAnthropic(base64Image, mimeType);
    case "openai":    return analyzeWithOpenAI(base64Image, mimeType);
    case "gemini":    return analyzeWithGemini(base64Image, mimeType);
    case "ollama":    return analyzeWithOllama(base64Image, mimeType);
    default: throw new Error(`Unknown AI_PROVIDER "${provider}". Use: anthropic | openai | gemini | ollama`);
  }
}

module.exports = { analyzeDocument };