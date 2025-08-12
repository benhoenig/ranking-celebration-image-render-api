export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    return res.json({ 
      success: true, 
      message: "Test endpoint working",
      method: req.method,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    return res.status(500).json({ error: error.message });
  }
}
