// netlify/functions/ebay-sold.js
// Uses eBay Finding API (findCompletedItems) — no special approval required.
// Swap to Marketplace Insights later by just changing the fetch logic below.

const cache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// EPN affiliate tracking — Campaign ID 5339146590
function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800',
  };

  const query = event.queryStringParameters?.query || '';
  if (!query.trim()) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Query parameter is required' }),
    };
  }

  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'EBAY_APP_ID not configured in Netlify environment variables.' }),
    };
  }

  // Serve from cache if fresh
  const cacheKey = query.toLowerCase().trim();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { statusCode: 200, headers, body: cached.body };
  }

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': query,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '5',
    'outputSelector': 'GalleryInfo',
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const items =
      data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

    const results = items.map((item) => {
      const rawUrl = item.viewItemURL?.[0] || '#';
      return {
        title: item.title?.[0] || 'Unknown',
        soldPrice: parseFloat(
          item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0
        ).toFixed(2),
        currency:
          item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
        soldDate: item.listingInfo?.[0]?.endTime?.[0] || '',
        image: item.galleryURL?.[0] || '',
        url: addAffiliate(rawUrl),
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
      };
    });

    const responseBody = JSON.stringify(results);
    cache[cacheKey] = { ts: Date.now(), body: responseBody };

    return { statusCode: 200, headers, body: responseBody };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch eBay sold data: ' + err.message }),
    };
  }
};
