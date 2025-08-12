import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Load template if not already loaded
    if (!templateDefinition) {
      await loadTemplateDefinition();
    }
    
    if (!templateDefinition) {
      return res.status(500).json({ error: "Template not loaded" });
    }
    
    return res.json(templateDefinition);
  }

  if (req.method === 'PUT') {
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
      
      return res.json({ success: true, message: "Template updated successfully" });
    } catch (err) {
      console.error("Failed to update template:", err);
      return res.status(500).json({ error: "Failed to update template" });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
