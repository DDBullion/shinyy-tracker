// ebay-sold-popular.js — Netlify Function
// Pre-fetches last 5 sold prices for 10 popular bullion products.
// Scrapes eBay completed listings — no API key required.
// Caches in Netlify Blobs for 4 hours. Calls are staggered to be polite.

const { getStore } = require('@netlify/blobs');

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const POPULAR_PRODUCTS = [
  { label: '1oz Silver Eagle',     query: '1oz American Silver Eagle coin',    metal: 'silver' },
  { label: '1oz Gold Eagle',       query: '1oz American Gold Eagle coin',      metal: 'gold'   },
  { label: '1oz Gold Buffalo',     query: '1oz American Gold Buffalo coin',    metal: 'gold'   },
  { label: '1oz Silver Maple',     query: '1oz Canadian Silver Maple Leaf',    metal: 'silver' },
  { label: '1oz Gold Maple',       query: '1oz Canadian Gold Maple Leaf coin', metal: 'gold'   },
  { label: '10oz Silver Bar',      query: '10oz silver bar .999',              metal: 'silver' },
  { label: '100oz Silver Bar',     query: '100oz silver bar .999',             metal: 'silver' },
  { label: '1oz Silver Round',     query: '1oz silver round .999',             metal: 'silver' },
  { label: 'Morgan Silver Dollar', query: 'Morgan Silver Dollar',              metal: 'silver' },
  { label: 'Engelhard Silver Bar', query: 'Engelhard silver bar',              metal: 'silver' },
];

// EPN affiliate tracking — Campaign ID 5339146590
function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

// Parse sold listings from raw eBay HTML (same logic as ebay-sold.js)
function parseSoldListings(html, maxResults = 5) {
  const results = [];
  const seen = new Set();
  const listingIdRegex = /data-listingid=["']?(\d+)["']?/g;
  let idMatch;
  while ((idMatch = listingIdRegex.exec(html)) !== null && results.length < maxResults) {
    const listingId = idMatch[1];
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    const block = html.substring(idMatch.index, idMatch.index + 3000);
    const soldMatch = block.match(/su-styled-text positive[^>]*>(Sold[^<]+)/);
    if (!soldMatch) continue;
    const priceMatch = block.match(/s-card__price[^>]*>\$?([\d,]+\.\d{2})/);
    if (!priceMatch) continue;
    const titleMatch = block.match(/s-card__title[^>]*>([\s\S]{1,400}?)<\/span>/);
    let title = 'Sold Item';
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/Opens in a new\s*(window|tab)?[^<]*/gi, '')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
    }
    const imgMatch = block.match(/src=(https:\/\/i\.ebayimg\.com[^\s"'<>]+)/);
    results.push({
      title,
      soldPrice: parseFloat(priceMatch[1].replace(/,/g, '')).toFixed(2),
      currency: 'USD',
      soldDate: soldMatch[1].replace(/\s+/g, ' ').trim(),
      image: imgMatch ? imgMatch[1] : '',
      url: addAffiliate('https://www.ebay.com/itm/' + listingId),
    });
  }
  return results;
}

// Fetch sold listings for one product query
async function fetchSoldForProduct(query) {
  const url = 'https://www.ebay.com/sch/i.html?' + new URLSearchParams({
    _nkw: query,
    LH_Complete: '1',
    LH_Sold: '1',
    _sop: '13',
    _ipg: '10',
  });
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  return parseSoldListings(html, 5);
}

// Small delay helper to be polite to eBay between requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=14400',
  };

  const BLOB_KEY = 'popular_products_v2';

  // 1. Try to serve from Netlify Blobs cache (4-hour TTL)
  try {
    const store = getStore('ebay-sold-cache');
    const cached = await store.getWithMetadata(BLOB_KEY, { type: 'text' });
    if (cached?.metadata?.ts && (Date.now() - cached.metadata.ts) < CACHE_TTL) {
      return { statusCode: 200, headers, body: cached.data };
    }
  } catch (_) {
    // Blobs unavailable — continue to live scrape
  }

  // 2. Scrape each product one at a time (staggered, not all at once)
  const products = [];
  for (const product of POPULAR_PRODUCTS) {
    try {
      const sales = await fetchSoldForProduct(product.query);
      if (sales.length > 0) {
        products.push({ label: product.label, query: product.query, metal: product.metal, sales });
      }
    } catch (err) {
      console.error('Skipped ' + product.label + ': ' + err.message);
    }
    // 500ms delay between requests to avoid triggering bot detection
    await delay(500);
  }

  const payload = { products, cachedAt: Date.now() };
  const body = JSON.stringify(payload);

  // 3. Save to Netlify Blobs
  try {
    const store = getStore('ebay-sold-cache');
    await store.set(BLOB_KEY, body, { metadata: { ts: Date.now() } });
  } catch (_) {}

  return { statusCode: 200, headers, body };
};
