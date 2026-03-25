exports.handler = async function(event) {
  const query = event.queryStringParameters?.query || 'test';
  const appId = process.env.EBAY_APP_ID || 'MISSING';
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': query,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'paginationInput.entriesPerPage': '3'
  });
  const url = 'https://svcs.ebay.com/services/search/FindingService/v1?' + params;
  try {
    const res = await fetch(url);
    const text = await res.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ appIdPrefix: appId.substring(0,20), httpStatus: res.status, body: text.substring(0, 1000) })
    };
  } catch(e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
