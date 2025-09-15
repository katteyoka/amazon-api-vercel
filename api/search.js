import https from 'https';
import crypto from 'crypto';

function hashHex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest(); // Buffer
}

function buildCanonicalHeaders(headers) {
  // headers: { lowercased-name: 'trimmed-value', ... }
  const sorted = Object.keys(headers).sort();
  const canonical = sorted.map(k => `${k}:${headers[k]}\n`).join('') + '\n';
  const signedHeaders = sorted.join(';');
  return { canonical, signedHeaders };
}

async function callPaapi(payloadObj) {
  const host = 'webservices.amazon.co.jp';
  const uri = '/paapi5/searchitems';
  const region = 'us-west-2';
  const service = 'ProductAdvertisingAPI';
  const method = 'POST';
  const payloadString = JSON.stringify(payloadObj);
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
  
  // ヘッダーをオブジェクトで作る（小文字で統一）
  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=UTF-8',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
  };
  
  const { canonical, signedHeaders } = buildCanonicalHeaders(headers);
  const payloadHash = hashHex(payloadString);
  
  const canonicalRequest = [
    method,
    uri,
    '', // query string
    canonical,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hashHex(canonicalRequest)
  ].join('\n');
  
  // 署名鍵（全て Buffer の状態で計算）
  const secret = process.env.AMAZON_SECRET_KEY;
  const kDate = hmac(Buffer.from('AWS4' + secret, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  
  const authorization = `${algorithm} Credential=${process.env.AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // 実際に送るヘッダー（キーの大文字小文字は自由だが値は canonical と一致させる）
  const requestHeaders = {
    'Content-Type': headers['content-type'],
    'Content-Encoding': headers['content-encoding'],
    'Host': headers['host'],
    'X-Amz-Date': headers['x-amz-date'],
    'X-Amz-Target': headers['x-amz-target'],
    'Authorization': authorization
  };
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path: uri,
      method,
      headers: requestHeaders
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.Errors) {
            return reject(new Error(parsed.Errors.map(e => `${e.Code}: ${e.Message}`).join(', ')));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Response parse error: ' + e.message));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(payloadString);
    req.end();
  });
}

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
    
    const payload = {
      Keywords: keyword,
      SearchIndex: category,
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
      ItemCount: parseInt(count)
    };
    
    const result = await callPaapi(payload);
    const formattedResult = formatResponse(result);
    
    res.status(200).json({ success: true, data: formattedResult });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
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
