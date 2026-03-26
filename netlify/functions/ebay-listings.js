const cache = {};
const CACHE_TTL = 30 * 60 * 1000;

exports.handler = async function(event) {
  const query = event.queryStringParameters?.query || '';
  if (!query.trim()) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Query parameter is required' }) };
  }
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'eBay API key not configured' }) };
  }
  const cacheKey = query.toLowerCase().trim();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: cached.body };
  }
  const url = 'https://svcs.ebay.com/services/search/FindingService/v1'
    + '?OPERATION-NAME=findItemsByKeywords'
    + '&SERVICE-VERSION=1.0.0'
    + '&SECURITY-APPNAME=' + encodeURIComponent(appId)
    + '&RESPONSE-DATA-FORMAT=JSON'
    + '&keywords=' + encodeURIComponent(query)
    + '&sortOrder=PricePlusShippingLowest'
    + '&paginationInput.entriesPerPage=12'
    + '&outputSelector(0)=GalleryInfo'
    + '&outputSelector(1)=SellerInfo';
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('[ebay-listings] raw (first 600):', text.substring(0, 600));
    let data;
    try { data = JSON.parse(text); } catch(e) { return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Non-JSON from eBay: ' + text.substring(0, 200) }) }; }
    const topKeys = Object.keys(data).join(',');
    console.log('[ebay-listings] top-level keys:', topKeys);
    const resp = data?.findItemsByKeywordsResponse?.[0];
    const ackStatus = resp?.ack?.[0];
    const total = resp?.paginationOutput?.[0]?.totalEntries?.[0];
    console.log('[ebay-listings] ack=' + ackStatus + ' total=' + total);
    if (ackStatus === 'Failure') {
      const errMsg = resp?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API error';
      return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: errMsg }) };
    }
    const items = resp?.searchResult?.[0]?.item || [];
    const results = items.map(item => ({
      title: item.title?.[0] || 'Unknown',
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0).toFixed(2),
      currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
      buyItNow: item.listingInfo?.[0]?.buyItNowAvailable?.[0] === 'true',
      listingType: item.listingInfo?.[0]?.listingType?.[0] || '',
      endTime: item.listingInfo?.[0]?.endTime?.[0] || '',
      image: item.galleryURL?.[0] || '',
      url: item.viewItemURL?.[0] || '#',
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
      seller: item.sellerInfo?.[0]?.sellerUserName?.[0] || '',
      feedbackScore: item.sellerInfo?.[0]?.feedbackScore?.[0] || '',
      shippingCost: item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || '0'
    }));
    const responseBody = JSON.stringify(results);
    cache[cacheKey] = { ts: Date.now(), body: responseBody };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: responseBody };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Failed to fetch eBay data: ' + err.message }) };
  }
};
