/**
 * test-ollama.js
 * Run this to test if Ollama is working correctly.
 * Usage: node test-ollama.js
 */

const axios = require("axios");

const base  = "http://localhost:11434";
const model = process.env.OLLAMA_MODEL || "moondream";

async function test() {
  console.log("=== Ollama Connection Test ===\n");

  // Step 1: Check Ollama is running
  console.log("1. Checking Ollama is running...");
  try {
    const r = await axios.get(`${base}/api/tags`);
    const models = r.data.models?.map(m => m.name) || [];
    console.log("   ✅ Ollama is running");
    console.log("   Available models:", models.join(", ") || "none");
  } catch (e) {
    console.log("   ❌ Ollama is NOT running!");
    console.log("   Fix: Open Ollama from Start menu and wait 30 seconds");
    process.exit(1);
  }

  // Step 2: Send a simple text prompt (no image)
  console.log("\n2. Testing simple text response...");
  try {
    const r = await axios.post(`${base}/api/generate`, {
      model,
      prompt: 'Reply with only this exact JSON: {"test": "ok"}',
      stream: false,
      options: { num_predict: 50, temperature: 0 }
    }, { timeout: 30000 });
    console.log("   ✅ Model responded");
    console.log("   Raw output:", r.data.response);
  } catch (e) {
    console.log("   ❌ Text test failed:", e.response?.data || e.message);
  }

  // Step 3: Send a tiny test image (1x1 white pixel PNG in base64)
  console.log("\n3. Testing with a tiny image...");
  const tinyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==";
  try {
    const r = await axios.post(`${base}/api/generate`, {
      model,
      prompt: 'Describe what you see. Reply with only JSON: {"seen": "your description"}',
      images: [tinyImage],
      stream: false,
      options: { num_predict: 100, temperature: 0, num_ctx: 2048 }
    }, { timeout: 60000 });
    console.log("   ✅ Image test succeeded");
    console.log("   Raw output:", r.data.response);
  } catch (e) {
    console.log("   ❌ Image test failed!");
    console.log("   Status:", e.response?.status);
    console.log("   Error:", JSON.stringify(e.response?.data, null, 2));
    console.log("\n   This is your exact problem. See fix below.");

    if (e.response?.data?.error?.includes("resource")) {
      console.log("\n   FIX: moondream may be corrupted. Try:");
      console.log("   ollama rm moondream");
      console.log("   ollama pull moondream");
    }
  }

  console.log("\n=== Test Complete ===");
}

test().catch(console.error);