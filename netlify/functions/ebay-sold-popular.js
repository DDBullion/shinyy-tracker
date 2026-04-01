// netlify/functions/ebay-sold-popular.js
// Pre-fetches the last 5 sold listings for each popular bullion product.
// Called once when the Last Sold tab loads — results are cached server-side
// for 4 hours so eBay API usage stays very low (~10 calls per 4 hours).
//
// SWAP POINT: When eBay reopens the Marketplace Insights API, replace the
// fetchProductSales() function below. The response format stays the same
// so the frontend never needs to change.

const cache = { data: null, ts: 0 };
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// EPN affiliate tracking
function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

// Popular products to auto-populate the Last Sold tab
const POPULAR_PRODUCTS = [
  {
    id: 'silver-eagle-1oz',
    label: '1oz American Silver Eagle',
    metal: 'silver',
    ozContent: 1,
    query: '1oz American Silver Eagle coin',
  },
  {
    id: 'gold-eagle-1oz',
    label: '1oz American Gold Eagle',
    metal: 'gold',
    ozContent: 1,
    query: '1oz American Gold Eagle coin',
  },
  {
    id: 'gold-buffalo-1oz',
    label: '1oz Gold Buffalo',
    metal: 'gold',
    ozContent: 1,
    query: '1oz Gold Buffalo coin',
  },
  {
    id: 'silver-maple-1oz',
    label: '1oz Silver Maple Leaf',
    metal: 'silver',
    ozContent: 1,
    query: '1oz Canadian Silver Maple Leaf coin',
  },
  {
    id: 'gold-maple-1oz',
    label: '1oz Gold Maple Leaf',
    metal: 'gold',
    ozContent: 1,
    query: '1oz Canadian Gold Maple Leaf coin',
  },
  {
    id: 'silver-bar-10oz',
    label: '10oz Silver Bar',
    metal: 'silver',
    ozContent: 10,
    query: '10oz silver bar .999',
  },
  {
    id: 'silver-bar-100oz',
    label: '100oz Silver Bar',
    metal: 'silver',
    ozContent: 100,
    query: '100oz silver bar .999',
  },
  {
    id: 'silver-round-1oz',
    label: '1oz Silver Round',
    metal: 'silver',
    ozContent: 1,
    query: '1oz silver round .999 generic',
  },
  {
    id: 'morgan-dollar',
    label: 'Morgan Silver Dollar',
    metal: 'silver',
    ozContent: 0.7734,
    query: 'Morgan Silver Dollar coin',
  },
  {
    id: 'engelhard-bar',
    label: 'Engelhard Silver Bar',
    metal: 'silver',
    ozContent: 1,
    query: 'Engelhard silver bar 1oz',
  },
];

// Fetch last 5 sold listings for a single product using eBay Finding API
async function fetchProductSales(product, appId) {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': product.query,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '5',
    'outputSelector': 'GalleryInfo',
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map((item) => ({
    title: item.title?.[0] || 'Unknown',
    soldPrice: parseFloat(
      item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0
    ).toFixed(2),
    currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
    soldDate: item.listingInfo?.[0]?.endTime?.[0] || '',
    image: item.galleryURL?.[0] || '',
    url: addAffiliate(item.viewItemURL?.[0] || '#'),
    condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
  }));
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'EBAY_APP_ID not configured.' }),
    };
  }

  // Serve from server-side cache if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ products: cache.data, cachedAt: cache.ts }),
    };
  }

  try {
    // Fetch all products in parallel — ~10 simultaneous API calls
    const results = await Promise.allSettled(
      POPULAR_PRODUCTS.map(async (product) => {
        const sales = await fetchProductSales(product, appId);
        return {
          id: product.id,
          label: product.label,
          metal: product.metal,
          ozContent: product.ozContent,
          sales,
        };
      })
    );

    const products = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((p) => p.sales.length > 0);

    cache.data = products;
    cache.ts = Date.now();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ products, cachedAt: cache.ts }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch popular sold data: ' + err.message }),
    };
  }
};
