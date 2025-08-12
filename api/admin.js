import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminHtmlPath = path.join(__dirname, "../admin.html");
    const htmlContent = await fs.readFile(adminHtmlPath, "utf8");
    
    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlContent);
  } catch (err) {
    console.error("Failed to serve admin page:", err);
    return res.status(500).json({ error: "Failed to load admin page" });
  }
}
