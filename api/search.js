const https = require('https');
const crypto = require('crypto');

export default async function handler(req, res) {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { keyword, category = 'All', count = 10 } = req.method === 'POST' ? req.body : req.query;
    
    if (!keyword) {
      return res.status(400).json({ error: 'keyword parameter required' });
    }
    
    const result = await searchAmazonProducts(keyword, category, count);
    res.status(200).json({ success: true, data: result });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ... 残りのコードも貼り付け
