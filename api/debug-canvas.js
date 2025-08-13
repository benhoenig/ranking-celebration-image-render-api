export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test 1: Can we import canvas?
    let canvasStatus = "unknown";
    let canvasError = null;
    
    try {
      const { createCanvas } = await import("canvas");
      
      // Test 2: Can we create a canvas?
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");
      
      // Test 3: Can we draw basic shapes?
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 100, 100);
      
      // Test 4: Can we convert to buffer?
      const buffer = canvas.toBuffer("image/png");
      
      canvasStatus = "working";
    } catch (error) {
      canvasStatus = "failed";
      canvasError = error.message;
    }

    return res.json({
      canvas: {
        status: canvasStatus,
        error: canvasError
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Debug failed", 
      message: error.message 
    });
  }
}
