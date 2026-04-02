// ebay-sold.js - Netlify Function
const { getStore } = require('@netlify/blobs');
const CACHE_TTL = 30 * 60 * 1000;

function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

function parseSoldListings(html) {
  const results = [];
  const seen = new Set();
  // Anchor on sold date marker
  const soldDateRegex = /su-styled-text positive[^>]*>([^<]+)/g;
  let soldMatch;
  while ((soldMatch = soldDateRegex.exec(html)) !== null && results.length < 5) {
    const soldDateRaw = soldMatch[1].replace(/\s+/g,' ').trim();
    if (!soldDateRaw.match(/\w+\s+\d/)) continue;
    const soldPos = soldMatch.index;
    // Look backwards up to 8000 chars for the LAST item URL before this sold date
    const backBlock = html.substring(Math.max(0, soldPos - 8000), soldPos);
    const urlRegex = new RegExp('href=https://(?:www\.)?ebay\.com/itm/(\\d+)', 'g');
    let urlMatch, lastUrlMatch = null;
    while ((urlMatch = urlRegex.exec(backBlock)) !== null) lastUrlMatch = urlMatch;
    if (!lastUrlMatch) continue;
    const listingId = lastUrlMatch[1];
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    // Look forward from sold date for price
    const fwdBlock = html.substring(soldPos, soldPos + 5000);
    const priceMatch = fwdBlock.match(/s-card__price[^>]*>\$?([\d,]+\.\d{2})/);
    if (!priceMatch) continue;
    // Title and image in full window
    const fullBlock = html.substring(Math.max(0, soldPos - 8000), soldPos + 5000);
    let title = 'Sold Item';
    const titleMatch = fullBlock.match(/aria-label="([^"]{10,150})"[^>]*class="[^"]*s-card/) ||
                       fullBlock.match(/s-card__info[^>]*>[\s\S]{0,300}?<[^>]+>([^<]{10,150})/);
    if (titleMatch) {
      title = titleMatch[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"')
        .replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
    }
    const imgMatch = fullBlock.match(/src="(https:\/\/i\.ebayimg\.com[^"]+)"/);
    results.push({
      title,
      soldPrice: parseFloat((priceMatch[1]||'0').replace(/,/g,'')).toFixed(2),
      currency: 'USD',
      soldDate: soldDateRaw,
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
  if (!query.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query parameter required' }) };
  const cacheKey = 'sold_' + query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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
  try {
    const scraperKey = process.env.SCRAPERAPI_KEY;
    if (!scraperKey) throw new Error('SCRAPERAPI_KEY not configured');
    const ebayUrl = 'https://www.ebay.com/sch/i.html?' + new URLSearchParams({
      _nkw: query, LH_Complete: '1', LH_Sold: '1', _sop: '13', _ipg: '10',
    });
    const scraperUrl = 'https://api.scraperapi.com?' + new URLSearchParams({
      api_key: scraperKey, url: ebayUrl, country_code: 'us',
    });
    const res = await fetch(scraperUrl);
    if (!res.ok) throw new Error('ScraperAPI returned HTTP ' + res.status);
    const html = await res.text();
    const results = parseSoldListings(html);
    const body = JSON.stringify(results);
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
