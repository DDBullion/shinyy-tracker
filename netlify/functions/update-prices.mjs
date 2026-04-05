// update-prices.mjs — Netlify Scheduled Function v2
// Runs daily at 6am UTC, scrapes FindBullionPrices.com,
// caches results to Netlify Blobs.
import { getStore } from '@netlify/blobs';

export const config = { schedule: '0 6 * * *' };

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const DEALER_URLS = {
  'SD Bullion':           'https://sdbullion.com',
  'APMEX':                'https://www.apmex.com',
  'Money Metals Exchange':'https://www.moneymetals.com',
  'Monument Metals':      'https://www.monumentmetals.com',
  'JM Bullion':           'https://www.jmbullion.com',
  'Bullion Exchanges':    'https://www.bullionexchanges.com',
  'BGASC':                'https://www.bgasc.com',
  'Hero Bullion':         'https://www.herobullion.com',
  'Provident Metals':     'https://www.providentmetals.com',
  'Silver Gold Bull':     'https://www.silvergoldbull.com',
  'Silver.com':           'https://www.silver.com',
};

const FBP_PAGES = [
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=1',      metal: 'silver', size: '1oz',    oz: 1      },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=5',      metal: 'silver', size: '5oz',    oz: 5      },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=10',     metal: 'silver', size: '10oz',   oz: 10     },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=100',    metal: 'silver', size: '100oz',  oz: 100    },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=32.15',  metal: 'silver', size: 'kilo',   oz: 32.15  },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=0.03215', metal: 'gold', size: 'gram',   oz: 0.03215 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.10',     metal: 'gold', size: 'tenth',  oz: 0.1     },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.25',     metal: 'gold', size: 'quarter',oz: 0.25    },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.50',     metal: 'gold', size: 'half',   oz: 0.5     },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=1',       metal: 'gold', size: '1oz',    oz: 1       },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=32.15',   metal: 'gold', size: 'kilo',   oz: 32.15   },
];

function getTag(name) {
  const n = name.toLowerCase();
  if (n.includes('eagle'))    return 'eagle';
  if (n.includes('maple'))    return 'maple';
  if (n.includes('buffalo'))  return 'buffalo';
  if (n.includes('britannia'))return 'britannia';
  if (n.includes('krugerrand'))return 'krugerrand';
  if (n.includes('kangaroo') || n.includes('nugget')) return 'kangaroo';
  if (n.includes('libertad')) return 'libertad';
  if (n.includes('panda'))    return 'panda';
  if (n.includes('geiger'))   return 'geiger';
  if (n.includes('scottsdale'))return 'scottsdale';
  return '';
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseDeals(html, page) {
  const results = [];
  const trRegex = /<tr[\s>][\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];
  for (const row of rows) {
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
    if (productName.toLowerCase().includes('product') || premCell.toLowerCase().includes('premium')) continue;

    const dealerKey = Object.keys(DEALER_URLS).find(d => dealerCell.startsWith(d));
    if (!dealerKey) continue;

    if (/tube|roll|lot|bag|face value|junk|fractional|cull|milky|tarnish|scruffy|damaged|circulated/i.test(productName)) continue;

    const premMatch = premCell.match(/^[\d.]+/);
    if (!premMatch) continue;
    const prem = parseFloat(premMatch[0]);
    if (isNaN(prem) || prem < 0) continue;

    const priceMatch = priceCell.replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;

    const shipMatch = dealerCell.match(/Free\s+(?:Shipping\s+)?[@$][^\s]+(?:\s+\$[\d,]+)?/i);
    const ship = shipMatch ? shipMatch[0].replace(/\s+/g, ' ').trim() : '';

    // Extract the FBP product path (e.g. /p/product-name/) for URL enrichment
    const fbpHrefM = cells[0].match(/href="(\/p\/[^"]+)"/);
    const fbpPath  = fbpHrefM ? fbpHrefM[1] : null;

    results.push({
      size:  page.size,
      name:  productName,
      dealer: dealerKey,
      prem:  Math.round(prem   * 100) / 100,
      price: Math.round(price  * 100) / 100,
      oz:    page.oz,
      ship,
      url:   DEALER_URLS[dealerKey], // replaced by enrichProductUrls()
      fbpPath,
      tag:   getTag(productName),
      verified: true,
    });
  }
  return results;
}

// Second pass: fetch each FBP product page and pull the real dealer product URL.
// FBP product pages have <tr id="vendor_N"> rows with direct dealer hrefs:
//   <a href="https://dealer.com/product" ... class="dealer-link">Dealer Name</a>
async function enrichProductUrls(deals) {
  const paths = [...new Set(deals.filter(d => d.fbpPath).map(d => d.fbpPath))];
  if (!paths.length) return;
  console.log('  enriching ' + paths.length + ' product pages…');

  const cache = {}; // fbpPath -> { 'Dealer Name': 'https://...' }

  // Fetch in batches of 8 with no delay — we want this fast
  const BATCH = 8;
  for (let i = 0; i < paths.length; i += BATCH) {
    await Promise.all(paths.slice(i, i + BATCH).map(async (fp) => {
      try {
        const r = await fetch('https://www.findbullionprices.com' + fp, {
          headers: HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return;
        const html = await r.text();

        // Match vendor rows: <tr id="vendor_N" ...> ... </tr>
        const vendorRows = html.match(/<tr id="vendor_\d+"[\s\S]*?<\/tr>/gi) || [];
        const map = {};
        for (const row of vendorRows) {
          // href="REAL_URL" ... class="dealer-link" ... title="Shop for X from DEALER"
          const hM = row.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*dealer-link/);
          const nM = row.match(/title="[^"]*from ([^"]+)"/);
          if (hM && nM) map[nM[1].trim()] = hM[1];
        }
        cache[fp] = map;
      } catch (e) {
        console.warn('  enrich fail ' + fp + ': ' + e.message);
      }
    }));
    // Small pause between batches to be polite
    if (i + BATCH < paths.length) await new Promise(r => setTimeout(r, 250));
  }

  let enriched = 0;
  for (const deal of deals) {
    if (deal.fbpPath && cache[deal.fbpPath]?.[deal.dealer]) {
      deal.url = cache[deal.fbpPath][deal.dealer];
      enriched++;
    }
    delete deal.fbpPath;
  }
  console.log('  enriched ' + enriched + '/' + deals.length + ' deals with direct product URLs');
}

export default async (req) => {
  console.log('update-prices: starting', new Date().toISOString());
  const store = getStore('prices');
  const allDeals = { silver: [], gold: [], updated: new Date().toISOString() };

  // Fetch all 11 pages IN PARALLEL — much faster than sequential
  const results = await Promise.allSettled(
    FBP_PAGES.map(async (page) => {
      const resp = await fetch(page.url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html  = await resp.text();
      const deals = parseDeals(html, page);
      console.log('  ' + page.metal + ' ' + page.size + ': ' + deals.length + ' deals');
      return { page, deals };
    })
  );

  let totalFetched = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allDeals[r.value.page.metal].push(...r.value.deals);
      totalFetched += r.value.deals.length;
    } else {
      console.warn('  page failed:', r.reason?.message);
    }
  }

  if (totalFetched >= 5) {
    await enrichProductUrls(allDeals.silver);
    await enrichProductUrls(allDeals.gold);
    await store.set('latest', JSON.stringify(allDeals));
    console.log('update-prices: saved ' + allDeals.silver.length + ' silver + ' + allDeals.gold.length + ' gold deals');
  } else {
    console.warn('update-prices: too few deals (' + totalFetched + '), keeping cache');
  }

  return new Response('OK: ' + totalFetched + ' deals');
};
