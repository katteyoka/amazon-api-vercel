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
  const dateStamp = amzDate.substr(0, 8);
  
  const canonicalHeaders = [
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=UTF-8',
    `host:${host}`,
    `x-amz-date:${amzDate}`,
    'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
  ].join('\n') + '\n';
  
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');
  
  const canonicalRequest = [
    'POST',
    uri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  
  // 署名計算 - 環境変数名を修正
  const kDate = crypto.createHmac('sha256', `AWS4${process.env.AMAZON_SECRET_KEY}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  
  const authorization = `${algorithm} Credential=${process.env.AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Amazon API呼び出し
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path: uri,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Amz-Date': amzDate,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
        'content-encoding': 'amz-1.0',
        'Authorization': authorization
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.Errors) {
            reject(new Error(response.Errors.map(e => `${e.Code}: ${e.Message}`).join(', ')));
          } else {
            resolve(formatResponse(response));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(payloadString);
    req.end();
  });
}

function formatResponse(data) {
  if (!data.SearchResult?.Items) {
    return { totalResults: 0, items: [] };
  }
  
  const items = data.SearchResult.Items.map(item => ({
    asin: item.ASIN,
    title: item.ItemInfo?.Title?.DisplayValue || null,
    brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || null,
    price: {
      amount: item.Offers?.Listings?.[0]?.Price?.Amount || null,
      currency: item.Offers?.Listings?.[0]?.Price?.Currency || 'JPY',
      displayAmount: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || null
    },
    images: {
      medium: item.Images?.Primary?.Medium?.URL || null
    },
    availability: item.Offers?.Listings?.[0]?.Availability?.Message || null,
    reviews: {
      count: item.CustomerReviews?.Count || 0,
      rating: item.CustomerReviews?.StarRating?.Value || null
    },
    link: item.DetailPageURL || null
  }));
  
  return {
    totalResults: data.SearchResult.TotalResultCount || items.length,
    items: items
  };
}
