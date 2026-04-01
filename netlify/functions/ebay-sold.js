// ebay-sold.js — Netlify Function
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
  const liRegex = /<li\s[^>]*data-listingid=["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<li\s[^>]*data-listingid=|$)/g;
  let match;
  while ((match = liRegex.exec(html)) !== null && results.length < 5) {
    const listingId = match[1];
    const block = match[2];
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    const soldMatch = block.match(/su-styled-text positive[^>]*>(Sold[^<]+)/);
    if (!soldMatch) continue;
    const priceMatch = block.match(/s-card__price[^>]*>\$?([\d,]+\.\d{2})/);
    if (!priceMatch) continue;
    const titleMatch = block.match(/s-card__title[^>]*>([\s\S]{1,400}?)<\/span>/);
    let title = 'Sold Item';
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/Opens in a new\s*(window|tab)?[^<]*/gi, '')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
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
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=1800' };
  const query = event.queryStringParameters?.query || '';
  const debug = event.queryStringParameters?._debug === '1';

  if (!query.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query parameter required' }) };

  const cacheKey = 'sold_' + query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (!debug) {
    try {
      const store = getStore('ebay-sold-cache');
      const cached = await store.getWithMetadata(cacheKey, { type: 'text' });
      if (cached?.metadata?.ts && (Date.now() - cached.metadata.ts) < CACHE_TTL) {
        return { statusCode: 200, headers, body: cached.data };
      }
    } catch (_) {}
  }

  try {
    const searchUrl = 'https://www.ebay.com/sch/i.html?' + new URLSearchParams({ _nkw: query, LH_Complete: '1', LH_Sold: '1', _sop: '13', _ipg: '10' });
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive', 'Upgrade-Insecure-Requests': '1', 'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) throw new Error('eBay returned HTTP ' + res.status);
    const html = await res.text();

    if (debug) {
      // Return diagnostic info directly in the response
      const hasListingId = html.includes('data-listingid');
      const hasSCard = html.includes('s-card');
      const hasSoldText = html.includes('Sold ');
      const firstIdx = html.indexOf('data-listingid');
      const snippet = firstIdx > -1 ? html.substring(firstIdx - 20, firstIdx + 300) : 'NOT FOUND';
      const liIdx = html.indexOf('<li ');
      const firstLi = liIdx > -1 ? html.substring(liIdx, liIdx + 200) : 'no li found';
      return { statusCode: 200, headers, body: JSON.stringify({ htmlLength: html.length, hasListingId, hasSCard, hasSoldText, snippet, firstLi }) };
    }

    const results = parseSoldListings(html);
    const body = JSON.stringify(results);
    if (results.length > 0) {
      try { const store = getStore('ebay-sold-cache'); await store.set(cacheKey, body, { metadata: { ts: Date.now(), query } }); } catch (_) {}
    }
    return { statusCode: 200, headers, body };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Scrape failed: ' + err.message }) };
  }
};
