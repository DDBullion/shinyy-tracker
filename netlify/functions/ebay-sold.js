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
  const itemUrlRegex = new RegExp('href=https://(?:www\\.)?ebay\\.com/itm/(\\d+)', 'g');
  let idMatch;
  let debugCount = 0;
  while ((idMatch = itemUrlRegex.exec(html)) !== null && results.length < 5) {
    const listingId = idMatch[1];
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    const block = html.substring(Math.max(0, idMatch.index - 300), idMatch.index + 3000);
    if (debugCount < 2) {
      console.log('BLOCK_' + debugCount + '_LEN:', block.length);
      console.log('BLOCK_' + debugCount + '_HAS_SCARDPRICE:', block.includes('s-card__price'));
      console.log('BLOCK_' + debugCount + '_HAS_SUSTYLEDPOS:', block.includes('su-styled-text positive'));
      console.log('BLOCK_' + debugCount + '_SOLD_IDX:', block.indexOf('su-styled-text positive'));
      console.log('BLOCK_' + debugCount + '_PRICE_IDX:', block.indexOf('s-card__price'));
      // Show chars around sold date in full HTML
      const soldIdx = html.indexOf('su-styled-text positive');
      const priceIdx = html.indexOf('s-card__price');
      const urlIdx = idMatch.index;
      console.log('FIRST_SOLD_AT:', soldIdx, 'FIRST_PRICE_AT:', priceIdx, 'URL_AT:', urlIdx);
      console.log('DIFF_SOLD_MINUS_URL:', soldIdx - urlIdx);
      console.log('DIFF_PRICE_MINUS_URL:', priceIdx - urlIdx);
      debugCount++;
    }
    const soldMatch = block.match(/su-styled-text positive[^>]+>([^<]+)/) ||
                      block.match(/aria-label="Sold Item"[^>]*>([^<]+)/);
    if (!soldMatch) continue;
    const priceMatch = block.match(/s-card__price[^>]*>\$?([\d,]+\.\d{2})/);
    if (!priceMatch) continue;
    let title = 'Sold Item';
    const titleMatch = block.match(/s-card__info[^>]*>[\s\S]{0,200}?<[^>]+>([^<]{8,150})/) ||
                       block.match(/aria-label="([^"]{8,150})"[^>]*class="[^"]*s-card/);
    if (titleMatch) {
      title = titleMatch[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"')
        .replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
    }
    const imgMatch = block.match(/src="(https:\/\/i\.ebayimg\.com[^"]+)"/);
    results.push({
      title,
      soldPrice: parseFloat((priceMatch[1]||'0').replace(/,/g,'')).toFixed(2),
      currency: 'USD',
      soldDate: soldMatch[1].replace(/\s+/g,' ').trim(),
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
    // DEBUG - remove after diagnosis
    console.log("HTML_LEN:", html.length);
    console.log("HAS_UNQUOTED_HREF:", html.includes("href=https://ebay.com/itm/"));
    console.log("HAS_QUOTED_HREF:", html.includes("href=\"https://www.ebay.com/itm/"));
    console.log("HAS_SCARDPRICE:", html.includes("s-card__price"));
    console.log("HAS_SITEMPHPRICE:", html.includes("s-item__price"));
    console.log("HAS_SUSTYLEDPOS:", html.includes("su-styled-text positive"));
    console.log("HAS_POSITIVE_CLASS:", html.includes("class=\"POSITIVE\""));
    console.log("HTML_SNIPPET:", html.substring(0, 300));
    console.log("ITM_SNIPPET:", html.substring(html.indexOf("itm/"), html.indexOf("itm/") + 200));
    // END DEBUG
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
