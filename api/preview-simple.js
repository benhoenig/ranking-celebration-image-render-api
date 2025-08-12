export default function handler(req, res) {
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
    
    // Return a simple base64 encoded 1x1 pixel red image as test
    const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const dataUrl = `data:image/png;base64,${testImageBase64}`;

    console.log("Simple preview working with template elements:", template.elements?.length || 0);
    
    return res.json({ 
      image: dataUrl,
      message: "Simple preview working - canvas rendering disabled for testing"
    });

  } catch (err) {
    console.error("Simple preview error:", err);
    return res.status(500).json({ error: "Simple preview failed: " + err.message });
  }
}
