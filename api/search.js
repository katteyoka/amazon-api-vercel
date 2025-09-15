import https from 'https';
import crypto from 'crypto';

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

async function searchAmazonProducts(keyword, searchIndex, itemCount) {
  const region = 'us-west-2';
  const host = 'webservices.amazon.co.jp';
  const uri = '/paapi5/searchitems';
  const service = 'ProductAdvertisingAPI';
  
  const payload = {
    Keywords: keyword,
    SearchIndex: searchIndex,
    Resources: [
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'ItemInfo.ByLineInfo',
      'Offers.Listings.Price',
      'Offers.Listings.Availability.Message',
      'CustomerReviews.Count',
      'CustomerReviews.StarRating'
    ],
    PartnerTag: process.env.ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.co.jp',
    ItemCount: parseInt(itemCount)
  };
  
  const payloadString = JSON.stringify(payload);
  
  // AWS署名v4生成
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateS
