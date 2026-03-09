/**
 * server.js — ID·VERIFY Backend
 * ─────────────────────────────────────────────────────────────────────────────
 * REST API that accepts an ID document image, validates it,
 * runs AI-powered forgery analysis, and returns a structured report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const sharp    = require("sharp");
const path     = require("path");
const { analyzeDocument } = require("./aiProvider");

const app  = express();
const PORT = process.env.PORT || 5000;
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "10");

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());

// ── Multer (in-memory file upload) ────────────────────────────────────────────
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
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, BMP, TIFF`));
    }
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    provider: process.env.AI_PROVIDER || "anthropic",
    maxFileSizeMB: MAX_MB,
    timestamp: new Date().toISOString()
  });
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post("/api/analyze", upload.single("document"), async (req, res) => {
  const startTime = Date.now();

  // 1. File presence check
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No file uploaded. Send a multipart/form-data request with field name 'document'."
    });
  }

  const { originalname, mimetype, size, buffer } = req.file;

  try {
    // 2. Image integrity check via sharp (catches corrupted files)
    let imageInfo;
    try {
      imageInfo = await sharp(buffer).metadata();
    } catch {
      return res.status(422).json({
        success: false,
        error: "File is corrupted or not a valid image."
      });
    }

    // 3. Minimum dimension check (too small = not a real ID scan)
    if (imageInfo.width < 100 || imageInfo.height < 100) {
      return res.status(422).json({
        success: false,
        error: `Image too small (${imageInfo.width}×${imageInfo.height}px). Minimum 100×100px required.`
      });
    }

    // 4. Convert to base64 for AI
    const base64Image = buffer.toString("base64");

    // 5. Run AI analysis
    const report = await analyzeDocument(base64Image, mimetype);

    // 6. Attach server-side metadata to report
    const enriched = {
      ...report,
      _meta: {
        filename:    originalname,
        fileSizeKB:  (size / 1024).toFixed(1),
        mimeType:    mimetype,
        dimensions:  `${imageInfo.width}×${imageInfo.height}`,
        aiProvider:  process.env.AI_PROVIDER || "anthropic",
        analyzedAt:  new Date().toISOString(),
        durationMs:  Date.now() - startTime
      }
    };

    return res.json({ success: true, report: enriched });

  } catch (err) {
    console.error("[analyze error]", err.message);

    // Distinguish API key errors from other failures
    const isAuthError = err.response?.status === 401 || err.response?.status === 403;
    return res.status(isAuthError ? 401 : 500).json({
      success: false,
      error: isAuthError
        ? "AI provider authentication failed. Check your API key in .env"
        : `Analysis failed: ${err.message}`
    });
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: `File too large. Maximum size is ${MAX_MB}MB.` });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ ID·VERIFY backend running`);
  console.log(`   URL:      http://localhost:${PORT}`);
  console.log(`   Provider: ${process.env.AI_PROVIDER || "anthropic"}`);
  console.log(`   Max file: ${MAX_MB}MB\n`);
});
