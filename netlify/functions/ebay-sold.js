// ebay-sold.js — Netlify Function
// Scrapes eBay completed/sold listings for a given search query.
// Routes through ScraperAPI to avoid IP blocking.
// Caches results in Netlify Blobs for 30 minutes.

const { getStore } = require('@netlify/blobs');
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

function parseSoldListings(html) {
  const results = [];
  const seen = new Set();
  const listingIdRegex = /data-listingid=["']?(\d+)["']?/g;
  let idMatch;
  while ((idMatch = listingIdRegex.exec(html)) !== null && results.length < 5) {
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
      title = titleMatch[1].replace(/<[^>]*>/g, '')
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

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=0',
  };

  const query = event.queryStringParameters?.query || '';
  if (!query.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query parameter required' }) };
  }

  const cacheKey = 'sold_' + query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  // 1. Try Netlify Blobs cache first
  try {
    const store = getStore('ebay-sold-cache');
    const cached = await store.getWithMetadata(cacheKey, { type: 'text' });
    if (cached?.metadata?.ts && (Date.now() - cached.metadata.ts) < CACHE_TTL) {
      const parsed = JSON.parse(cached.data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { statusCode: 200, headers, body: cached.data };
      }
    }
  } catch (_) {}

  // 2. Scrape via ScraperAPI (handles IP rotation + anti-bot automatically)
  try {
    const scraperKey = process.env.SCRAPERAPI_KEY;
    if (!scraperKey) throw new Error('SCRAPERAPI_KEY not configured');

    const ebayUrl = 'https://www.ebay.com/sch/i.html?' + new URLSearchParams({
      _nkw: query,
      LH_Complete: '1',
      LH_Sold: '1',
      _sop: '13',
      _ipg: '10',
    });

    const scraperUrl = 'https://api.scraperapi.com?' + new URLSearchParams({
      api_key: scraperKey,
      url: ebayUrl,
      country_code: 'us',
    });

    const res = await fetch(scraperUrl);
    if (!res.ok) throw new Error('ScraperAPI returned HTTP ' + res.status);

    const html = await res.text();
    const results = parseSoldListings(html);
    const body = JSON.stringify(results);

    // 3. Cache to Blobs if we got results
    if (results.length > 0) {
      try {
        const store = getStore('ebay-sold-cache');
        await store.set(cacheKey, body, { metadata: { ts: Date.now(), query } });
      } catch (_) {}
    }

    return { statusCode: 200, headers, body };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Scrape failed: ' + err.message }) };
  }
};
