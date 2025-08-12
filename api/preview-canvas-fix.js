let createCanvas, loadImage, registerFont;

try {
  const canvas = await import("canvas");
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
  registerFont = canvas.registerFont;
  console.log("Canvas package loaded successfully");
} catch (e) {
  console.error("Failed to load canvas package:", e.message);
  throw new Error("Canvas package not available in this environment");
}

import path from "path";
import fetch from "node-fetch";
import crypto from "crypto";

// Register custom font (DB-Adman-X)
const assetsDir = path.join(process.cwd(), "assets");
const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");

let fontRegistered = false;
try {
  registerFont(fontPath, { family: "DB-Adman-X" });
  console.log("Font registered successfully:", fontPath);
  fontRegistered = true;
} catch (e) {
  console.warn("Warning: failed to register font at", fontPath, e?.message || e);
}

function resolvePlaceholders(value, data) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return data[key] ?? "";
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius || 0, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { template, data } = req.body;
    
    if (!template || !data) {
      return res.status(400).json({ error: "Both template and data are required" });
    }
    
    const requestId = crypto.randomUUID();
    const log = (...args) => console.log(`[${requestId}-canvas-fix]`, ...args);
    
    log("start preview with canvas fix");
    
    // Create a simple test canvas
    const canvas = createCanvas(1080, 1080);
    const ctx = canvas.getContext("2d");
    
    // Fill with white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1080, 1080);
    
    // Add some simple text
    ctx.fillStyle = "#000000";
    ctx.font = fontRegistered ? "48px DB-Adman-X" : "48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Canvas Working!", 540, 540);
    
    // Convert to base64
    const buffer = canvas.toBuffer("image/png");
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    log("canvas preview completed");
    
    return res.json({ 
      image: dataUrl,
      message: "Canvas working with fixed imports!"
    });

  } catch (err) {
    console.error("Canvas fix preview error:", err);
    return res.status(500).json({ error: "Canvas fix preview failed: " + err.message });
  }
}
