export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    return res.status(200).json({ 
      message: "API is working!",
      timestamp: new Date().toISOString(),
      query: req.query
    });
  } catch (error) {
    return res.status(500).json({ 
      error: error.message 
    });
  }
}
