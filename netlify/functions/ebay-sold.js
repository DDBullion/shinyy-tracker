const cache = {};
const CACHE_TTL = 10 * 60 * 1000;

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
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
      body: cached.body
    };
  }

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': query,
    'categoryId': '11116',
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '3',
    'outputSelector': 'GalleryInfo'
  });

  const url = 'https://svcs.ebay.com/services/search/FindingService/v1?' + params;

  try {
    const res = await fetch(url);
    const data = await res.json();
        console.log('eBay raw ack:', data?.findCompletedItemsResponse?.[0]?.ack?.[0], '| totalEntries:', data?.findCompletedItemsResponse?.[0]?.paginationOutput?.[0]?.totalEntries?.[0], '| errorMsg:', JSON.stringify(data?.findCompletedItemsResponse?.[0]?.errorMessage));

    const ackStatus = data?.findCompletedItemsResponse?.[0]?.ack?.[0];
    if (ackStatus === 'Failure') {
      const errMsg = data?.findCompletedItemsResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API error';
      return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: errMsg }) };
    }

    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const results = items.map(item => ({
      title: item.title?.[0] || 'Unknown',
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0).toFixed(2),
      currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
      date: item.listingInfo?.[0]?.endTime?.[0] || '',
      image: item.galleryURL?.[0] || '',
      url: item.viewItemURL?.[0] || '#',
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || ''
    }));

    const responseBody = JSON.stringify(results);
    cache[cacheKey] = { ts: Date.now(), body: responseBody };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
      body: responseBody
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Failed to fetch eBay data: ' + err.message }) };
  }
};
