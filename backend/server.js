/**
 * server.js - ID-VERIFY Backend
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const sharp    = require("sharp");
const { analyzeDocument } = require("./aiProvider");

const app  = express();
const PORT = process.env.PORT || 5000;
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "10");

app.use(cors({ origin: "*" }));
app.use(express.json());

const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp",
  "image/bmp",  "image/tiff"
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    provider: process.env.AI_PROVIDER || "anthropic",
    ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "llava",
    maxFileSizeMB: MAX_MB,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/analyze", upload.single("document"), async (req, res) => {
  const startTime = Date.now();
  console.log("\n--- New analysis request ---");

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const { originalname, mimetype, size, buffer } = req.file;
  console.log(`File: ${originalname} | Type: ${mimetype} | Size: ${(size/1024).toFixed(1)}KB`);

  try {
    // Image integrity check
    let imageInfo;
    try {
      imageInfo = await sharp(buffer).metadata();
      console.log(`Dimensions: ${imageInfo.width}x${imageInfo.height}`);
    } catch (sharpErr) {
      console.error("Sharp error:", sharpErr.message);
      return res.status(422).json({ success: false, error: "File is corrupted or not a valid image." });
    }

    if (imageInfo.width < 100 || imageInfo.height < 100) {
      return res.status(422).json({
        success: false,
        error: `Image too small (${imageInfo.width}x${imageInfo.height}px). Minimum 100x100px.`
      });
    }

    const base64Image = buffer.toString("base64");
    console.log(`Provider: ${process.env.AI_PROVIDER || "anthropic"}`);
    console.log("Calling AI provider...");

    const report = await analyzeDocument(base64Image, mimetype);
    console.log(`Done in ${Date.now() - startTime}ms. Risk: ${report.overallRisk}`);

    return res.json({
      success: true,
      report: {
        ...report,
        _meta: {
          filename:   originalname,
          fileSizeKB: (size / 1024).toFixed(1),
          mimeType:   mimetype,
          dimensions: `${imageInfo.width}x${imageInfo.height}`,
          aiProvider: process.env.AI_PROVIDER || "anthropic",
          analyzedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime
        }
      }
    });

  } catch (err) {
    // Print the FULL error so we can debug
    console.error("=== ANALYSIS ERROR ===");
    console.error("Message:", err.message);
    console.error("Status:", err.response?.status);
    console.error("Response data:", JSON.stringify(err.response?.data, null, 2));
    console.error("Stack:", err.stack);
    console.error("======================");

    const status = err.response?.status;
    const isAuth = status === 401 || status === 403;

    return res.status(isAuth ? 401 : 500).json({
      success: false,
      error: isAuth
        ? "AI provider authentication failed. Check your API key in .env"
        : `Analysis failed: ${err.message}`
    });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: `File too large. Max is ${MAX_MB}MB.` });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`\n✅ ID-VERIFY backend running`);
  console.log(`   URL:      http://localhost:${PORT}`);
  console.log(`   Provider: ${process.env.AI_PROVIDER || "anthropic"}`);
  if ((process.env.AI_PROVIDER || "") === "ollama") {
    console.log(`   Ollama:   ${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}`);
    console.log(`   Model:    ${process.env.OLLAMA_MODEL || "llava"}`);
  }
  console.log(`   Max file: ${MAX_MB}MB\n`);
  console.log("Checking Ollama connection...");
  const axios = require("axios");
  axios.get(`${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/tags`)
    .then(r => {
      const models = r.data.models?.map(m => m.name) || [];
      console.log("Ollama models available:", models.join(", ") || "none");
      const needed = process.env.OLLAMA_MODEL || "llava";
      if (!models.some(m => m.startsWith(needed))) {
        console.warn(`\n⚠️  WARNING: Model "${needed}" not found!`);
        console.warn(`   Run this command: ollama pull ${needed}\n`);
      } else {
        console.log(`✅ Model "${needed}" is ready.\n`);
      }
    })
    .catch(() => {
      console.warn("\n⚠️  WARNING: Cannot connect to Ollama!");
      console.warn("   Make sure Ollama is running (check system tray).");
      console.warn("   Or restart Ollama from the Start menu.\n");
    });
});