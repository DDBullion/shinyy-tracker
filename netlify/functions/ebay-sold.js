const cache = {};
const tokenCache = { token: null, expiry: 0 };
const CACHE_TTL = 30 * 60 * 1000;

async function getAccessToken(clientId, clientSecret) {
  if (tokenCache.token && Date.now() < tokenCache.expiry - 60000) {
    return tokenCache.token;
  }
  const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%20https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%2Fbuy.marketplace.insights'
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth failed: ' + (data.error_description || JSON.stringify(data)));
  tokenCache.token = data.access_token;
  tokenCache.expiry = Date.now() + (data.expires_in * 1000);
  return tokenCache.token;
}

exports.handler = async function(event) {
  const query = event.queryStringParameters?.query || '';
  if (!query.trim()) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Query parameter is required' }) };
  }
  const clientId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'eBay API credentials not configured' }) };
  }
  const cacheKey = query.toLowerCase().trim();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: cached.body };
  }
  try {
    const token = await getAccessToken(clientId, clientSecret);
    const searchUrl = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search'
      + '?q=' + encodeURIComponent(query)
      + '&sort=soldDate'
      + '&limit=20';
    const res = await fetch(searchUrl, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    const data = await res.json();
    if (data.errors) {
      const errMsg = data.errors[0]?.message || 'eBay API error';
      return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: errMsg }) };
    }
    const sales = data.itemSales || [];
    const results = sales.map(item => ({
      title: item.title || 'Unknown',
      soldPrice: parseFloat(item.lastSoldPrice?.value || 0).toFixed(2),
      currency: item.lastSoldPrice?.currency || 'USD',
      soldDate: item.soldDate || '',
      image: item.image?.imageUrl || '',
      url: item.itemWebUrl || '#',
      condition: item.condition || '',
      seller: item.seller?.username || '',
      shippingCost: '0'
    }));
    const responseBody = JSON.stringify(results);
    cache[cacheKey] = { ts: Date.now(), body: responseBody };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: responseBody };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Failed to fetch eBay sold data: ' + err.message }) };
  }
};
