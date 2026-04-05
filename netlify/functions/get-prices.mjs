// get-prices.mjs — Netlify Function v2
// v2 functions automatically receive Blobs context — no config needed.
import { getStore } from '@netlify/blobs';

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
    return new Response(raw, {
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
