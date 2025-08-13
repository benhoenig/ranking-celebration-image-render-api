import express from "express";
import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fetch from "node-fetch";
import fs from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";

const app = express();

// Register custom font (DB-Adman-X)
const assetsDir = path.join(process.cwd(), "assets");
const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");
console.log("🔤 FONT DEBUG: Attempting to register font at:", fontPath);
console.log("🔤 FONT DEBUG: Assets dir:", assetsDir);
console.log("🔤 FONT DEBUG: Working directory:", process.cwd());

try {
  registerFont(fontPath, { family: "DB-Adman-X" });
  console.log("✅ FONT SUCCESS: Font registered successfully at", fontPath);
} catch (e) {
  console.error("❌ FONT FAILED: Failed to register font at", fontPath);
  console.error("❌ FONT ERROR:", e?.message || e);
  console.error("❌ FONT STACK:", e?.stack);
}
app.use(express.json());

// Determine __dirname in ESM and ensure a public directory exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
try {
  await fs.mkdir(publicDir, { recursive: true });
} catch (e) {
  console.warn("Warning: unable to create public directory:", e?.message || e);
}

// Serve static images from /i
app.use(
  "/i",
  express.static(publicDir, {
    maxAge: "7d",
  })
);

// Load template JSON at startup
const templatePath = path.join(process.cwd(), "templates", "template.json");
let templateDefinition = null;
async function loadTemplateDefinition() {
  try {
    const json = await fs.readFile(templatePath, "utf8");
    templateDefinition = JSON.parse(json);
  } catch (err) {
    console.error("Failed to load template.json:", err);
    templateDefinition = null;
  }
}
await loadTemplateDefinition();

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

// API endpoint to get current template
app.get("/api/template", (req, res) => {
  if (!templateDefinition) {
    return res.status(500).json({ error: "Template not loaded" });
  }
  res.json(templateDefinition);
});

// API endpoint to update template
app.put("/api/template", async (req, res) => {
  try {
    const newTemplate = req.body;
    
    // Basic validation
    if (!newTemplate || !newTemplate.elements || !Array.isArray(newTemplate.elements)) {
      return res.status(400).json({ error: "Invalid template format" });
    }
    
    // Save to file
    await fs.writeFile(templatePath, JSON.stringify(newTemplate, null, 2));
    
    // Update in-memory template
    templateDefinition = newTemplate;
    
    res.json({ success: true, message: "Template updated successfully" });
  } catch (err) {
    console.error("Failed to update template:", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// Serve admin page
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Debug endpoint: Test Canvas package
app.get("/debug-canvas", async (req, res) => {
  try {
    let canvasStatus = "unknown";
    let canvasError = null;
    
    try {
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 100, 100);
      const buffer = canvas.toBuffer("image/png");
      canvasStatus = "working";
    } catch (error) {
      canvasStatus = "failed";
      canvasError = error.message;
    }

    return res.json({
      canvas: { status: canvasStatus, error: canvasError },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Debug failed", message: error.message });
  }
});

// Debug endpoint: Test Assets
app.get("/debug-assets", async (req, res) => {
  try {
    const results = {};
    const assetsDir = path.join(process.cwd(), "assets");
    
    try {
      const assetsList = await fs.readdir(assetsDir);
      results.assetsDir = { exists: true, path: assetsDir, files: assetsList };
    } catch (error) {
      results.assetsDir = { exists: false, path: assetsDir, error: error.message };
    }
    
    const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");
    try {
      const fontStats = await fs.stat(fontPath);
      results.fontFile = { exists: true, path: fontPath, size: fontStats.size };
    } catch (error) {
      results.fontFile = { exists: false, path: fontPath, error: error.message };
    }
    
    const bgPath = path.join(assetsDir, "background.png");
    try {
      const bgStats = await fs.stat(bgPath);
      results.backgroundImage = { exists: true, path: bgPath, size: bgStats.size };
    } catch (error) {
      results.backgroundImage = { exists: false, path: bgPath, error: error.message };
    }

    return res.json({ workingDirectory: process.cwd(), assets: results });
  } catch (error) {
    return res.status(500).json({ error: "Asset debug failed", message: error.message });
  }
});

// Debug endpoint: Test Placeholders
app.post("/debug-placeholders", (req, res) => {
  try {
    const testData = req.body || {};
    const tests = [
      { name: "Badge Color", template: "{{ badge_color }}", expected: testData.badge_color || "MISSING" },
      { name: "Border Color", template: "{{ border_color }}", expected: testData.border_color || "MISSING" },
      { name: "Sales Name", template: "{{ sales_name }}", expected: testData.sales_name || "MISSING" }
    ];
    
    const results = tests.map(test => ({
      ...test,
      resolved: resolvePlaceholders(test.template, testData),
      success: resolvePlaceholders(test.template, testData) === test.expected
    }));

    return res.json({
      receivedData: testData,
      tests: results,
      summary: {
        totalTests: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Placeholder debug failed", message: error.message });
  }
});

// Debug endpoint: Test Font Rendering
app.get("/debug-font", async (req, res) => {
  try {
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext("2d");
    
    // Test both fonts
    const tests = [
      { font: "60px DB-Adman-X", text: "Custom Font Test", y: 80 },
      { font: "40px Arial", text: "Arial Fallback Test", y: 140 }
    ];
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 200);
    
    const results = [];
    tests.forEach((test, i) => {
      ctx.font = test.font;
      ctx.fillStyle = "#000000";
      ctx.fillText(test.text, 20, test.y);
      
      results.push({
        requested: test.font,
        actual: ctx.font,
        text: test.text,
        fontMatches: ctx.font === test.font
      });
    });
    
    const buffer = canvas.toBuffer("image/png");
    const base64Image = buffer.toString('base64');
    
    return res.json({
      fontTests: results,
      image: `data:image/png;base64,${base64Image}`,
      fontRegistrationPath: fontPath,
      assetsDir: assetsDir
    });
  } catch (error) {
    return res.status(500).json({ error: "Font debug failed", message: error.message });
  }
});

// Preview endpoint that accepts custom template without saving
app.post("/preview", async (req, res) => {
  try {
    const { template, data } = req.body;
    
    if (!template || !data) {
      return res.status(400).json({ error: "Both template and data are required" });
    }
    
    const requestId = crypto.randomUUID();
    const log = (...args) => console.log(`[${requestId}-preview]`, ...args);
    const logWarn = (...args) => console.warn(`[${requestId}-preview]`, ...args);
    const logError = (...args) => console.error(`[${requestId}-preview]`, ...args);
    
    log("start /preview");
    
    // Use provided template instead of templateDefinition
    const customTemplate = template;
    
    // Load background from custom template, fallback to assets/background.png
    let bgImage = null;
    if (customTemplate?.background) {
      const bgTemplatePath = resolvePlaceholders(customTemplate.background, data);
      const resolvedBgPath = path.isAbsolute(bgTemplatePath)
        ? bgTemplatePath
        : path.join(process.cwd(), bgTemplatePath);
      try {
        log("load-background: template path", resolvedBgPath);
        bgImage = await loadImage(resolvedBgPath);
        log("load-background: template path ok");
      } catch (e) {
        logWarn("load-background: template path failed, falling back to assets/background.png", e?.message || e);
      }
    }
    if (!bgImage) {
      const fallbackBg = path.join(assetsDir, "background.png");
      log("load-background: fallback path", fallbackBg);
      bgImage = await loadImage(fallbackBg);
      log("load-background: fallback ok");
    }

    const width = bgImage.width || 1080;
    const height = bgImage.height || 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Draw background full-size
    ctx.drawImage(bgImage, 0, 0, width, height);

    // Render elements from custom template
    if (customTemplate?.elements?.length) {
      for (const element of customTemplate.elements) {
        const type = element.type;
        if (type === "image") {
          const name = element.name || "image";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const sourceRaw = element.source ?? "";
          const source = resolvePlaceholders(sourceRaw, data);

          // Optional border for circular clip
          const border = element.border || null;
          const hasCircleClip = element.clip === "circle";

          let imageObj = null;
          if (source.startsWith("http://") || source.startsWith("https://")) {
            log("element:image fetch", { name, url: source });
            const resp = await fetch(source);
            if (!resp.ok) {
              throw new Error(`Failed to fetch image (${name}): ${resp.status}`);
            }
            const buf = Buffer.from(await resp.arrayBuffer());
            imageObj = await loadImage(buf);
            log("element:image load ok", { name });
          } else {
            const localPath = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
            log("element:image load local", { name, path: localPath });
            imageObj = await loadImage(localPath);
            log("element:image load ok", { name });
          }

          if (hasCircleClip && border && border.width && border.color) {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 + border.width / 2, 0, Math.PI * 2);
            ctx.fillStyle = resolvePlaceholders(border.color, data) || "#000000";
            ctx.fill();
          }

          ctx.save();
          if (hasCircleClip) {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
          }
          ctx.drawImage(imageObj, x, y, w, h);
          ctx.restore();
          log("element:image drawn", { name, x, y, w, h });
        } else if (type === "rectangle") {
          const name = element.name || "rectangle";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const radius = element.radius ?? 0;
          const color = resolvePlaceholders(element.color ?? "#000000", data);
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.fillStyle = color;
          ctx.fill();
          log("element:rectangle drawn", { name, x, y, w, h, radius, color });
        } else if (type === "text") {
          const name = element.name || "text";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const fontSize = element.fontSize ?? 24;
          const color = resolvePlaceholders(element.color ?? "#000000", data);
          const text = resolvePlaceholders(element.text ?? "", data);
          const align = (element.align || "left").toLowerCase();
          const fontFamilyRaw = element.font || "DB-Adman-X";
          const fontFamily = resolvePlaceholders(fontFamilyRaw, data) || "DB-Adman-X";

          ctx.font = `${fontSize}px ${fontFamily}`;
          ctx.fillStyle = color;
          ctx.textAlign = ["left", "right", "center"].includes(align) ? align : "left";
          ctx.fillText(text, x, y);
          log("element:text drawn", { name, x, y, fontSize, color, align, fontFamily });
        }
      }
    }

    // Save the PNG to disk in public/ with a unique filename, then return JSON URL
    const buffer = canvas.toBuffer("image/png");

    const id = crypto.randomUUID();
    const filename = `preview-${id}.png`;
    const filePath = path.join(publicDir, filename);

    try {
      log("save-file", { path: filePath });
      await fs.writeFile(filePath, buffer);
      log("save-file ok", { path: filePath });
    } catch (writeErr) {
      logError("save-file failed", writeErr);
      return res.status(500).json({ error: "Failed to save preview image" });
    }

    const url = `https://ranking-celebration-image-render-api.onrender.com/i/${filename}`;
    log("done", { url });
    return res.json({ url });

  } catch (err) {
    console.error("[preview-unhandled]", err);
    res.status(500).send({ error: "Preview generation failed" });
  }
});

app.post("/render", async (req, res) => {
  try {
    const requestId = crypto.randomUUID();
    const log = (...args) => console.log(`[${requestId}]`, ...args);
    const logWarn = (...args) => console.warn(`[${requestId}]`, ...args);
    const logError = (...args) => console.error(`[${requestId}]`, ...args);
    log("start /render");
    // Load background from template, fallback to assets/background.png
    let bgImage = null;
    if (templateDefinition?.background) {
      const bgTemplatePath = resolvePlaceholders(templateDefinition.background, req.body);
      const resolvedBgPath = path.isAbsolute(bgTemplatePath)
        ? bgTemplatePath
        : path.join(process.cwd(), bgTemplatePath);
      try {
        log("load-background: template path", resolvedBgPath);
        bgImage = await loadImage(resolvedBgPath);
        log("load-background: template path ok");
      } catch (e) {
        logWarn("load-background: template path failed, falling back to assets/background.png", e?.message || e);
      }
    }
    if (!bgImage) {
      const fallbackBg = path.join(assetsDir, "background.png");
      log("load-background: fallback path", fallbackBg);
      bgImage = await loadImage(fallbackBg);
      log("load-background: fallback ok");
    }

    const width = bgImage.width || 1080;
    const height = bgImage.height || 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // CRITICAL: Log canvas dimensions and coordinates
    log("canvas-setup", { width, height, bgWidth: bgImage.width, bgHeight: bgImage.height });

    // CRITICAL: Test if Canvas has scaling issues
    const testFont = "100px Arial";
    ctx.font = testFont;
    const testMeasure = ctx.measureText("TEST");
    log("canvas-scaling-test", { 
      requestedFont: testFont, 
      actualFont: ctx.font,
      testWidth: testMeasure.width,
      testHeight: testMeasure.actualBoundingBoxAscent,
      scalingWorking: testMeasure.actualBoundingBoxAscent > 50 
    });

    // Draw background full-size
    ctx.drawImage(bgImage, 0, 0, width, height);
    
    // Log initial canvas state
    log("canvas-initial-state", { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign });

    // Render elements from template
    if (templateDefinition?.elements?.length) {
      for (const element of templateDefinition.elements) {
        const type = element.type;
        if (type === "image") {
          const name = element.name || "image";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const sourceRaw = element.source ?? "";
          const source = resolvePlaceholders(sourceRaw, req.body);

          // Optional border for circular clip
          const border = element.border || null;
          const hasCircleClip = element.clip === "circle";

          let imageObj = null;
          if (source.startsWith("http://") || source.startsWith("https://")) {
            log("element:image fetch", { name, url: source });
            const resp = await fetch(source);
            if (!resp.ok) {
              throw new Error(`Failed to fetch image (${name}): ${resp.status}`);
            }
            const buf = Buffer.from(await resp.arrayBuffer());
            imageObj = await loadImage(buf);
            log("element:image load ok", { name });
          } else {
            const localPath = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
            log("element:image load local", { name, path: localPath });
            imageObj = await loadImage(localPath);
            log("element:image load ok", { name });
          }

          if (hasCircleClip && border && border.width && border.color) {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 + border.width / 2, 0, Math.PI * 2);
            ctx.fillStyle = resolvePlaceholders(border.color, req.body) || "#000000";
            ctx.fill();
          }

          ctx.save();
          if (hasCircleClip) {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
          }
          ctx.drawImage(imageObj, x, y, w, h);
          ctx.restore();
          log("element:image drawn", { name, x, y, w, h });
        } else if (type === "rectangle") {
          const name = element.name || "rectangle";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const radius = element.radius ?? 0;
          const colorTemplate = element.color ?? "#000000";
          const color = resolvePlaceholders(colorTemplate, req.body);
          log("element:rectangle color resolution", { name, template: colorTemplate, resolved: color, data: req.body });
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.fillStyle = color;
          ctx.fill();
          log("element:rectangle drawn", { name, x, y, w, h, radius, color });
        } else if (type === "text") {
          const name = element.name || "text";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const fontSize = element.fontSize ?? 24;
          const colorTemplate = element.color ?? "#000000";
          const color = resolvePlaceholders(colorTemplate, req.body);
          const textTemplate = element.text ?? "";
          const text = resolvePlaceholders(textTemplate, req.body);
          const align = (element.align || "left").toLowerCase();
          const fontFamilyRaw = element.font || "DB-Adman-X";
          const fontFamily = resolvePlaceholders(fontFamilyRaw, req.body) || "DB-Adman-X";

          log("element:text details", { name, fontSize, colorTemplate, color, textTemplate, text, fontFamily });
          
          // Debug font setting with explicit fallback
          const fontString = `${fontSize}px "${fontFamily}", Arial, sans-serif`;
          log("element:text font setting", { fontString, before: ctx.font });
          ctx.font = fontString;
          log("element:text font after setting", { fontString, after: ctx.font });
          
          // Test if font is actually working by measuring test character
          const testMetrics = ctx.measureText("M");
          const expectedHeight = fontSize * 0.7; // Rough estimate for font height
          const actualWorking = testMetrics.actualBoundingBoxAscent > expectedHeight * 0.5;
          log("element:text font validation", { 
            fontSize, 
            testChar: "M", 
            expectedHeight, 
            actualHeight: testMetrics.actualBoundingBoxAscent,
            fontWorking: actualWorking,
            fontFamily 
          });
          
          // CRITICAL FIX: If font scaling is broken, apply manual scaling
          if (!actualWorking && testMetrics.actualBoundingBoxAscent < expectedHeight * 0.5) {
            const scaleFactor = expectedHeight / (testMetrics.actualBoundingBoxAscent || 1);
            const correctedFontSize = Math.round(fontSize * scaleFactor);
            const correctedFontString = `${correctedFontSize}px "${fontFamily}", Arial, sans-serif`;
            ctx.font = correctedFontString;
            log("element:text SCALING FIX applied", { 
              originalSize: fontSize, 
              correctedSize: correctedFontSize, 
              scaleFactor, 
              newFont: correctedFontString 
            });
          }
          
          ctx.fillStyle = color;
          ctx.textAlign = ["left", "right", "center"].includes(align) ? align : "left";
          
          // Debug text rendering
          log("element:text about to draw", { text, x, y, fontSize, color, fontFamily, actualFont: ctx.font, actualFillStyle: ctx.fillStyle });
          
          // CRITICAL: Test if text actually renders by measuring it
          const textMetrics = ctx.measureText(text);
          log("element:text metrics", { text, width: textMetrics.width, actualHeight: textMetrics.actualBoundingBoxAscent });
          
          // Save context before drawing
          const beforeDraw = { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign };
          
          ctx.fillText(text, x, y);
          
          // Check if context changed after drawing
          const afterDraw = { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign };
          log("element:text context check", { beforeDraw, afterDraw, contextChanged: JSON.stringify(beforeDraw) !== JSON.stringify(afterDraw) });
          
          log("element:text drawn", { name, x, y, fontSize, color, align, fontFamily });
        }
      }
    }

    // CRITICAL: Test canvas buffer export for corruption
    log("canvas-export-test", { 
      canvasWidth: canvas.width, 
      canvasHeight: canvas.height,
      expectedPixels: canvas.width * canvas.height,
      canvasType: canvas.constructor.name 
    });

    // Save the PNG to disk in public/ with a unique filename, then return JSON URL
    const buffer = canvas.toBuffer("image/png");
    
    // CRITICAL: Analyze buffer for corruption signs
    const bufferSize = buffer.length;
    const expectedMinSize = 10000; // 900x900 PNG should be at least 10KB
    const expectedMaxSize = 5000000; // Should be under 5MB
    const bufferCorrupted = bufferSize < expectedMinSize || bufferSize > expectedMaxSize;
    
    // CRITICAL: Test if canvas pixels are actually rendered correctly
    const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
    const pixels = imageData.data;
    let nonZeroPixels = 0;
    let coloredPixels = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a > 0) nonZeroPixels++;
      if (r > 50 || g > 50 || b > 50) coloredPixels++; // Non-black pixels
    }
    
    log("canvas-pixel-debug", {
      sampledPixels: pixels.length / 4,
      nonZeroPixels,
      coloredPixels,
      pixelRatio: coloredPixels / (pixels.length / 4),
      firstPixelRGBA: [pixels[0], pixels[1], pixels[2], pixels[3]]
    });

    log("canvas-buffer-debug", {
      bufferSize,
      bufferSizeKB: Math.round(bufferSize / 1024),
      expectedMinSize,
      expectedMaxSize,
      bufferCorrupted,
      bufferStart: buffer.slice(0, 16).toString('hex'), // PNG header
      bufferValidPNG: buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a'
    });

    const id = crypto.randomUUID();
    const filename = `${id}.png`;
    const filePath = path.join(publicDir, filename);

    try {
      log("save-file", { path: filePath });
      await fs.writeFile(filePath, buffer);
      log("save-file ok", { path: filePath });
    } catch (writeErr) {
      logError("save-file failed", writeErr);
      return res.status(500).json({ error: "Failed to save image" });
    }

    const url = `https://ranking-celebration-image-render-api.onrender.com/i/${filename}`;
    log("done", { url });
    return res.json({ url });

  } catch (err) {
    console.error("[unhandled]", err);
    res.status(500).send({ error: "Image generation failed" });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Image generation API running on port ${port}`);
});
