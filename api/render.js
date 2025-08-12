import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fetch from "node-fetch";
import fs from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register custom font (DB-Adman-X)
const assetsDir = path.join(process.cwd(), "assets");
const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");
try {
  registerFont(fontPath, { family: "DB-Adman-X" });
  console.log("Font registered successfully:", fontPath);
} catch (e) {
  console.warn("Warning: failed to register font at", fontPath, e?.message || e);
  // Continue without custom font - will fall back to system fonts
}

// Load template JSON
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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Load template if not already loaded
    if (!templateDefinition) {
      await loadTemplateDefinition();
    }

    if (!templateDefinition) {
      return res.status(500).json({ error: "Template not loaded" });
    }

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
        : path.join(__dirname, "..", bgTemplatePath);
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
      try {
        bgImage = await loadImage(fallbackBg);
        log("load-background: fallback ok");
      } catch (bgErr) {
        console.warn("Background image not found, creating default canvas");
        // Create a default 1080x1080 white background if image fails
        const defaultCanvas = createCanvas(1080, 1080);
        const defaultCtx = defaultCanvas.getContext("2d");
        defaultCtx.fillStyle = "#ffffff";
        defaultCtx.fillRect(0, 0, 1080, 1080);
        bgImage = defaultCanvas;
      }
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
            const localPath = path.isAbsolute(source) ? source : path.join(__dirname, "..", source);
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
          log("element:rectangle about to fill", { name, fillStyle: ctx.fillStyle, color });
          ctx.fill();
          log("element:rectangle drawn", { name, x, y, w, h, radius, color, actualFillStyle: ctx.fillStyle });
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
          ctx.font = `${fontSize}px ${fontFamily}`;
          ctx.fillStyle = color;
          ctx.textAlign = ["left", "right", "center"].includes(align) ? align : "left";
          ctx.fillText(text, x, y);
          log("element:text drawn", { name, x, y, fontSize, color, align, fontFamily });
        }
      }
    }

    // Convert canvas to base64 instead of saving to file
    const buffer = canvas.toBuffer("image/png");
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    log("done", { imageSize: buffer.length, base64Length: base64Image.length });
    return res.json({ image: dataUrl });

  } catch (err) {
    console.error("[unhandled]", err);
    res.status(500).send({ error: "Image generation failed" });
  }
}
