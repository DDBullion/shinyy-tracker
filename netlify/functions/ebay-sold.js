exports.handler = async function(event) {
  const query = event.queryStringParameters?.query || '';
  if (!query.trim()) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Query required' }) };
  }
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'eBay API key not configured' }) };
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
  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    // Return raw response for debugging
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: res.status, preview: text.substring(0, 500) })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
};
