// get-prices.mjs — Netlify Function v2
// v2 functions automatically receive Blobs context — no config needed.
import { getStore } from '@netlify/blobs';

// Fallback dealer URLs — used to rewrite any cached FBP product-page URLs
const DEALER_URLS = {
  'SD Bullion': 'https://sdbullion.com',
  'APMEX': 'https://www.apmex.com',
  'Money Metals Exchange': 'https://www.moneymetals.com',
  'Monument Metals': 'https://www.monumentmetals.com',
  'JM Bullion': 'https://www.jmbullion.com',
  'Bullion Exchanges': 'https://www.bullionexchanges.com',
  'BGASC': 'https://www.bgasc.com',
  'Hero Bullion': 'https://www.herobullion.com',
  'Provident Metals': 'https://www.providentmetals.com',
  'Silver Gold Bull': 'https://www.silvergoldbull.com',
  'Silver.com': 'https://www.silver.com',
};

function fixDeal(d) {
  // Only rewrite if URL is actually on findbullionprices.com (not just utm_source param)
  if (d.url && /^https?:\/\/(www\.)?findbullionprices\.com/i.test(d.url)) {
    d.url = DEALER_URLS[d.dealer] || d.url;
  }
  return d;
}

export default async (req) => {
  try {
    const store = getStore('prices');
    const raw = await store.get('latest');
    if (!raw) {
      return Response.json(
        { error: 'No price data cached yet' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
    // Rewrite any lingering FBP product-page URLs to real dealer homepages
    const data = JSON.parse(raw);
    if (data.silver) data.silver = data.silver.map(fixDeal);
    if (data.gold)   data.gold   = data.gold.map(fixDeal);
    if (data.junk)   data.junk   = data.junk.map(fixDeal);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('get-prices error:', err.message);
    return Response.json(
      { error: 'Internal error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
};
