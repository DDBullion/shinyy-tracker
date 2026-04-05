import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }});
  }

  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return new Response('Unauthorized', { status: 401 });

  let userId;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    userId = payload.sub;
    if (!userId) throw new Error('no sub');
  } catch(e) {
    return new Response('Invalid token', { status: 401 });
  }

  const store = getStore('stacks');
  const key = 'user_' + userId;

  if (req.method === 'GET') {
    const data = await store.get(key) || '[]';
    return new Response(data, { status: 200, headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }});
  }

  if (req.method === 'POST') {
    const body = await req.text();
    try { JSON.parse(body); } catch(e) {
      return new Response('Invalid JSON', { status: 400 });
    }
    await store.set(key, body);
    return new Response('OK', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  return new Response('Method not allowed', { status: 405 });
}

export const config = { path: '/api/stack' };
