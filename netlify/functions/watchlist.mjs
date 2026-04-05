import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }});
  }

  // Authenticate via Netlify Identity JWT
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return new Response('Unauthorized', { status: 401 });

  let userId;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    userId = payload.sub;
    if (!userId) throw new Error('no sub');
  } catch(e) {
    return new Response('Invalid token', { status: 401 });
  }

  const store = getStore('watchlists');
  const key = 'user_' + userId;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (req.method === 'GET') {
    const data = await store.get(key);
    return new Response(data || '{}', { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    const body = await req.text();
    try { JSON.parse(body); } catch(e) {
      return new Response('Bad JSON', { status: 400 });
    }
    await store.set(key, body);
    return new Response('{"ok":true}', { headers: corsHeaders });
  }

  return new Response('Method not allowed', { status: 405 });
}

export const config = { path: '/api/watchlist' };
