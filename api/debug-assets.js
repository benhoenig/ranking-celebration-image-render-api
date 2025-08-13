import path from "path";
import fs from "fs/promises";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const results = {};
    
    // Test 1: Check if assets directory exists
    const assetsDir = path.join(process.cwd(), "assets");
    try {
      const assetsList = await fs.readdir(assetsDir);
      results.assetsDir = {
        exists: true,
        path: assetsDir,
        files: assetsList
      };
    } catch (error) {
      results.assetsDir = {
        exists: false,
        path: assetsDir,
        error: error.message
      };
    }
    
    // Test 2: Check specific font file
    const fontPath = path.join(assetsDir, "DB-Adman-X.ttf");
    try {
      const fontStats = await fs.stat(fontPath);
      results.fontFile = {
        exists: true,
        path: fontPath,
        size: fontStats.size
      };
    } catch (error) {
      results.fontFile = {
        exists: false,
        path: fontPath,
        error: error.message
      };
    }
    
    // Test 3: Check background image
    const bgPath = path.join(assetsDir, "background.png");
    try {
      const bgStats = await fs.stat(bgPath);
      results.backgroundImage = {
        exists: true,
        path: bgPath,
        size: bgStats.size
      };
    } catch (error) {
      results.backgroundImage = {
        exists: false,
        path: bgPath,
        error: error.message
      };
    }
    
    // Test 4: Check template file
    const templatePath = path.join(process.cwd(), "templates", "template.json");
    try {
      const templateStats = await fs.stat(templatePath);
      results.templateFile = {
        exists: true,
        path: templatePath,
        size: templateStats.size
      };
    } catch (error) {
      results.templateFile = {
        exists: false,
        path: templatePath,
        error: error.message
      };
    }

    return res.json({
      workingDirectory: process.cwd(),
      assets: results
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Asset debug failed", 
      message: error.message 
    });
  }
}
