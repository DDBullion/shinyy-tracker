// update-prices.js — Netlify Scheduled Function
// Runs daily at 6am, scrapes FindBullionPrices.com,
// caches results to Netlify Blobs. Zero cost.

const { getStore } = require('@netlify/blobs');

// ── Dealers we recognize + their homepage URLs ──────────────────────────────
const DEALER_URLS = {
  'SD Bullion':             'https://sdbullion.com',
  'APMEX':                  'https://www.apmex.com',
  'Money Metals Exchange':  'https://www.moneymetals.com',
  'Monument Metals':        'https://www.monumentmetals.com',
  'JM Bullion':             'https://www.jmbullion.com',
  'Bullion Exchanges':      'https://www.bullionexchanges.com',
  'BGASC':                  'https://www.bgasc.com',
  'Hero Bullion':           'https://www.herobullion.com',
  'Provident Metals':       'https://www.providentmetals.com',
  'Silver Gold Bull':       'https://www.silvergoldbull.com',
  'Silver.com':             'https://www.silver.com',
};

// ── FBP pages mapped to our site's tab structure ─────────────────────────────
const FBP_PAGES = [
  // Silver
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=1',     metal: 'silver', size: '1oz',   oz: 1       },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=5',     metal: 'silver', size: '5oz',   oz: 5       },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=10',    metal: 'silver', size: '10oz',  oz: 10      },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=100',   metal: 'silver', size: '100oz', oz: 100     },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=32.15', metal: 'silver', size: 'kilo',  oz: 32.15   },
  // Gold
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=0.03215', metal: 'gold', size: 'gram',    oz: 0.03215 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.10',     metal: 'gold', size: 'tenth',   oz: 0.1     },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.25',     metal: 'gold', size: 'quarter', oz: 0.25    },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.50',     metal: 'gold', size: 'half',    oz: 0.5     },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=1',       metal: 'gold', size: '1oz',     oz: 1       },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=32.15',   metal: 'gold', size: 'kilo',    oz: 32.15   },
];

// ── Tag detection (maps product name to our filter tabs) ────────────────────
function getTag(name) {
  const n = name.toLowerCase();
  if (n.includes('eagle'))                      return 'eagle';
  if (n.includes('maple'))                      return 'maple';
  if (n.includes('buffalo'))                    return 'buffalo';
  if (n.includes('britannia'))                  return 'britannia';
  if (n.includes('krugerrand'))                 return 'krugerrand';
  if (n.includes('kangaroo') || n.includes('nugget')) return 'kangaroo';
  if (n.includes('libertad'))                   return 'libertad';
  if (n.includes('panda'))                      return 'panda';
  if (n.includes('geiger'))                     return 'geiger';
  if (n.includes('scottsdale'))                 return 'scottsdale';
  return '';
}

// ── Strip HTML tags, collapse whitespace ────────────────────────────────────
function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
            .replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

// ── Parse FBP table HTML into deal objects ───────────────────────────────────
function parseDeals(html, page) {
  const results = [];

  // Extract all <tr>...</tr> blocks (non-greedy)
  const trRegex = /<tr[\s>][\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];

  for (const row of rows) {
    // Extract <td> cells
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let m;
    while ((m = tdRegex.exec(row)) !== null) cells.push(m[1]);
    if (cells.length < 4) continue;

    const productName = stripHtml(cells[0]);
    const dealerCell  = stripHtml(cells[1]);
    const premCell    = stripHtml(cells[2]);
    const priceCell   = stripHtml(cells[3]);

    if (!productName || !dealerCell || !priceCell) continue;

    // Skip header rows
    if (productName.toLowerCase().includes('product') || premCell.toLowerCase().includes('premium')) continue;

    // Only include dealers we recognize on our site
    const dealerKey = Object.keys(DEALER_URLS).find(d => dealerCell.startsWith(d));
    if (!dealerKey) continue;

    // Skip junk silver (tubes, lots, rolls, face value bags)
    const pLower = productName.toLowerCase();
    if (/tube|roll|lot|bag|face value|junk|fractional|cull|milky|tarnish|scruffy|damaged|circulated/i.test(pLower)) continue;

    // Parse premium ($ over spot)
    const premMatch = premCell.match(/^[\d.]+/);
    if (!premMatch) continue;
    const prem = parseFloat(premMatch[0]);
    if (isNaN(prem) || prem < 0) continue;

    // Parse total price
    const priceMatch = priceCell.replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;

    // Extract shipping info
    const shipMatch = dealerCell.match(/Free\s+(?:Shipping\s+)?[@$][^\s]+(?:\s+\$[\d,]+)?/i);
    const ship = shipMatch ? shipMatch[0].replace(/\s+/g, ' ').trim() : '';

    results.push({
      size:    page.size,
      name:    productName,
      dealer:  dealerKey,
      prem:    Math.round(prem * 100) / 100,
      price:   Math.round(price * 100) / 100,
      oz:      page.oz,
      ship,
      url:     DEALER_URLS[dealerKey],
      tag:     getTag(productName),
      verified: true,
    });
  }

  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log('update-prices: starting scrape', new Date().toISOString());

  const store = getStore('prices');
  const allDeals = { silver: [], gold: [], updated: new Date().toISOString() };
  let totalFetched = 0;

  for (const page of FBP_PAGES) {
    try {
      const resp = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        console.warn('FBP fetch failed: ' + page.url + ' ' + resp.status);
        continue;
      }

      const html = await resp.text();
      const deals = parseDeals(html, page);
      allDeals[page.metal].push(...deals);
      totalFetched += deals.length;
      console.log('  ' + page.metal + ' ' + page.size + ': ' + deals.length + ' deals');

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 800));

    } catch (err) {
      console.error('Error fetching ' + page.url + ': ' + err.message);
    }
  }

  // Only save if we got reasonable data (safety check)
  if (totalFetched >= 5) {
    await store.set('latest', JSON.stringify(allDeals));
    console.log('update-prices: saved ' + allDeals.silver.length + ' silver + ' + allDeals.gold.length + ' gold deals');
  } else {
    console.warn('update-prices: too few deals scraped, keeping existing cache');
  }

  return { statusCode: 200, body: 'OK: ' + totalFetched + ' deals' };
};
