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
  const soldDateRegex = /su-styled-text positive[^>]*>([^<]+)/g;
  let soldMatch;
  while ((soldMatch = soldDateRegex.exec(html)) !== null && results.length < 5) {
    const soldDateRaw = soldMatch[1].replace(/\s+/g,' ').trim();
    if (!soldDateRaw.match(/\w+\s+\d/)) continue;
    const soldPos = soldMatch.index;
    const backBlock = html.substring(Math.max(0, soldPos - 8000), soldPos);
    const urlRegex = new RegExp('href=https://(?:www\\.)?ebay\\.com/itm/(\\d+)', 'g');
    let urlMatch, lastUrlMatch = null;
    while ((urlMatch = urlRegex.exec(backBlock)) !== null) lastUrlMatch = urlMatch;
    if (!lastUrlMatch) continue;
    const listingId = lastUrlMatch[1];
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    const fwdBlock = html.substring(soldPos, soldPos + 5000);
    const priceMatch = fwdBlock.match(/s-card__price[^>]*>\$?([\d,]+\.\d{2})/);
    if (!priceMatch) continue;
    const fullBlock = html.substring(Math.max(0, soldPos - 8000), soldPos + 5000);
    // Anchor image+title to s-card__image element (src before alt in eBay HTML)
    const cardImgMatch = fullBlock.match(/s-card__image[^>]*src=(https:\/\/i\.ebayimg\.com[^\s>]+)[^>]*alt="([^"]{5,200})"/) ||
                         fullBlock.match(/s-card__image[^>]*alt="([^"]{5,200})"[^>]*src=(https:\/\/i\.ebayimg\.com[^\s>]+)/);
    let title = 'Sold Item';
    let imageUrl = '';
    if (cardImgMatch) {
      // Determine which group is src vs alt based on match order
      const firstAttr = cardImgMatch[0].indexOf('src=') < cardImgMatch[0].indexOf('alt=') ? 'src' : 'alt';
      if (firstAttr === 'src') { imageUrl = cardImgMatch[1]; title = cardImgMatch[2]; }
      else { title = cardImgMatch[1]; imageUrl = cardImgMatch[2]; }
      title = title.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
    }
    // Skip eBay promotional/store content — not real sold listings
    if (/\b(visit|selling has never|never been easier|shop ebay|ebay live|ebay store|bid now|buy it now only)\b/i.test(title)) continue;
    // Require title to look like a real coin/bullion item
    const looksReal = /\b(19|20)\d{2}\b/.test(title) ||
      /\b(oz|silver|gold|coin|eagle|maple|bar|round|morgan|dollar|bullion|mint|pcgs|ngc|ms\d|pf\d|sp\d|troy|grain|gram)\b/i.test(title);
    if (!looksReal) continue;
    results.push({
      title,
      soldPrice: parseFloat((priceMatch[1]||'0').replace(/,/g,'')).toFixed(2),
      currency: 'USD',
      soldDate: soldDateRaw,
      image: imageUrl,
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
