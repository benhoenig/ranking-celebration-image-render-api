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
try {
  registerFont(fontPath, { family: "DB-Adman-X" });
} catch (e) {
  console.warn("Warning: failed to register font at", fontPath, e?.message || e);
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

    // Draw background full-size
    ctx.drawImage(bgImage, 0, 0, width, height);

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
          const color = resolvePlaceholders(element.color ?? "#000000", req.body);
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.fillStyle = color;
          ctx.fill();
          log("element:rectangle drawn", { name, x, y, w, h, radius, color });
        } else if (type === "text") {
          const name = element.name || "text";
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const fontSize = element.fontSize ?? 24;
          const color = resolvePlaceholders(element.color ?? "#000000", req.body);
          const text = resolvePlaceholders(element.text ?? "", req.body);
          const align = (element.align || "left").toLowerCase();
          const fontFamilyRaw = element.font || "DB-Adman-X";
          const fontFamily = resolvePlaceholders(fontFamilyRaw, req.body) || "DB-Adman-X";

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
