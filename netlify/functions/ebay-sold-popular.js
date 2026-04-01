// ebay-sold-popular.js — Netlify Function
// Pre-fetches last 5 sold prices for 10 popular bullion products.
// Routes through ScraperAPI to avoid IP blocking.
// Caches in Netlify Blobs for 12 hours.


const { getStore } = require('@netlify/blobs');


const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const BLOB_KEY = 'popular_products_v4';


const POPULAR_PRODUCTS = [
  { label: '1oz Silver Eagle',     query: '1oz American Silver Eagle coin',    metal: 'silver' },
  { label: '1oz Gold Eagle',       query: '1oz American Gold Eagle coin',      metal: 'gold'   },
  { label: '1oz Gold Buffalo',     query: '1oz American Gold Buffalo coin',    metal: 'gold'   },
  { label: '1oz Silver Maple',     query: '1oz Canadian Silver Maple Leaf',    metal: 'silver' },
  { label: '1oz Gold Maple',       query: '1oz Canadian Gold Maple Leaf coin', metal: 'gold'   },
  { label: '10oz Silver Bar',      query: '10oz silver bar .999',              metal: 'silver' },
  { label: '100oz Silver Bar',     query: '100oz silver bar .999',             metal: 'silver' },
  { label: '1oz Silver Round',     query: '1oz silver round .999',             metal: 'silver' },
  { label: 'Morgan Silver Dollar', query: 'Morgan Silver Dollar',              metal: 'silver' },
  { label: 'Engelhard Silver Bar', query: 'Engelhard silver bar',              metal: 'silver' },
];


// EPN affiliate tracking — Campaign ID 5339146590
function addAffiliate(url) {
  if (!url || url === '#') return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}


function parseSoldListings(html, maxResults = 5) {
  const results = [];
  const seen = new Set();
  const listingIdRegex = /data-listingid=["']?(\d+)["']?/g;
  let idMatch;
  while ((idMatch = listingIdRegex.exec(html)) !== null && results.length < maxResults) {
