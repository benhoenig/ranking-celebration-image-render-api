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
    return res.status(405).json({ error: 'Method not allowed - use POST' });
  }

  try {
    const testData = req.body || {};
    
    // Test cases
    const tests = [
      {
        name: "Badge Color",
        template: "{{ badge_color }}",
        expected: testData.badge_color || "MISSING"
      },
      {
        name: "Border Color", 
        template: "{{ border_color }}",
        expected: testData.border_color || "MISSING"
      },
      {
        name: "Sales Name",
        template: "{{ sales_name }}",
        expected: testData.sales_name || "MISSING"
      },
      {
        name: "Static Text",
        template: "No placeholder here",
        expected: "No placeholder here"
      }
    ];
    
    const results = tests.map(test => ({
      ...test,
      resolved: resolvePlaceholders(test.template, testData),
      success: resolvePlaceholders(test.template, testData) === test.expected
    }));

    return res.json({
      receivedData: testData,
      dataKeys: Object.keys(testData),
      tests: results,
      summary: {
        totalTests: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Placeholder debug failed", 
      message: error.message 
    });
  }
}
