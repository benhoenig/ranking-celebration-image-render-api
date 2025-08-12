import sharp from "sharp";
import fetch from "node-fetch";
import path from "path";
import fs from "fs/promises";

function resolvePlaceholders(value, data) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return data[key] ?? "";
  });
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
    
    console.log("Sharp preview starting with template elements:", template.elements?.length || 0);
    
    // Create a basic white background using Sharp
    let backgroundBuffer;
    
    // Try to load custom background first
    if (template.background) {
      const bgPath = path.join(process.cwd(), template.background);
      try {
        backgroundBuffer = await fs.readFile(bgPath);
        console.log("Loaded custom background:", bgPath);
      } catch (e) {
        console.warn("Failed to load background, using default:", e.message);
        // Create a white 1080x1080 background
        backgroundBuffer = await sharp({
          create: {
            width: 1080,
            height: 1080,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
          }
        }).png().toBuffer();
      }
    } else {
      // Create default white background
      backgroundBuffer = await sharp({
        create: {
          width: 1080,
          height: 1080,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).png().toBuffer();
    }

    // For now, just return the background without text/elements
    // (Text rendering with Sharp is complex, this is a basic version)
    let finalImage = sharp(backgroundBuffer);

    // Convert to base64
    const imageBuffer = await finalImage.png().toBuffer();
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    console.log("Sharp preview completed, image size:", imageBuffer.length);
    
    return res.json({ 
      image: dataUrl,
      message: "Sharp-based preview (basic version without text rendering)"
    });

  } catch (err) {
    console.error("Sharp preview error:", err);
    return res.status(500).json({ error: "Sharp preview failed: " + err.message });
  }
}
