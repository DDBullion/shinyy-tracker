// get-prices.js — Netlify On-Demand Function
// Called by the frontend on page load.
// Returns cached prices from Netlify Blobs.
// If no cache exists yet, returns 404 and frontend falls back to hardcoded data.

const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore('prices');
    const raw = await store.get('latest');

    if (!raw) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No price data cached yet' }),
      };
    }

    const data = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
      body: raw, // already stringified, no double-encode
    };

  } catch (err) {
    console.error('get-prices error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};
