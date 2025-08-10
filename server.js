import express from "express";
import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fetch from "node-fetch";
import fs from "fs/promises";

const app = express();

// Register custom font (DB-Admin-X)
const assetsDir = path.join(process.cwd(), "assets");
const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");
try {
  registerFont(fontPath, { family: "DB-Admin-X" });
} catch (e) {
  console.warn("Warning: failed to register font at", fontPath, e?.message || e);
}
app.use(express.json());

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

app.post("/generate-image", async (req, res) => {
  try {
    // Load background from template, fallback to assets/background.png
    let bgImage = null;
    if (templateDefinition?.background) {
      const bgTemplatePath = resolvePlaceholders(templateDefinition.background, req.body);
      const resolvedBgPath = path.isAbsolute(bgTemplatePath)
        ? bgTemplatePath
        : path.join(process.cwd(), bgTemplatePath);
      try {
        bgImage = await loadImage(resolvedBgPath);
      } catch (e) {
        console.warn("Failed to load background from template path, falling back to assets/background.png:", e?.message || e);
      }
    }
    if (!bgImage) {
      const fallbackBg = path.join(assetsDir, "background.png");
      bgImage = await loadImage(fallbackBg);
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
            const resp = await fetch(source);
            if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
            const buf = Buffer.from(await resp.arrayBuffer());
            imageObj = await loadImage(buf);
          } else {
            const localPath = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
            imageObj = await loadImage(localPath);
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
        } else if (type === "rectangle") {
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const radius = element.radius ?? 0;
          const color = resolvePlaceholders(element.color ?? "#000000", req.body);
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.fillStyle = color;
          ctx.fill();
        } else if (type === "text") {
          const x = element.x ?? 0;
          const y = element.y ?? 0;
          const fontSize = element.fontSize ?? 24;
          const color = resolvePlaceholders(element.color ?? "#000000", req.body);
          const text = resolvePlaceholders(element.text ?? "", req.body);
          const align = (element.align || "left").toLowerCase();

          ctx.font = `${fontSize}px DB-Admin-X`;
          ctx.fillStyle = color;
          ctx.textAlign = ["left", "right", "center"].includes(align) ? align : "left";
          ctx.fillText(text, x, y);
        }
      }
    }

    // Save and send image
    const buffer = canvas.toBuffer("image/png");
    res.set("Content-Type", "image/png");
    res.send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Image generation failed" });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Image generation API running on port ${port}`);
});
