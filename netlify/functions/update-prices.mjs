// update-prices.mjs — Netlify Scheduled Function v2
// Runs every 3 hours, scrapes FindBullionPrices.com,
// caches results + enriched product URLs to Netlify Blobs.
import { getStore } from '@netlify/blobs';

export const config = { schedule: '0 */3 * * *' };

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
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=1',    metal: 'silver', size: '1oz',    oz: 1 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=5',    metal: 'silver', size: '5oz',    oz: 5 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=10',   metal: 'silver', size: '10oz',   oz: 10 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=100',  metal: 'silver', size: '100oz',  oz: 100 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=32.15',metal: 'silver', size: 'kilo',   oz: 32.15 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=0.03215', metal: 'gold', size: 'gram',    oz: 0.03215 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.10',     metal: 'gold', size: 'tenth',   oz: 0.1 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.25',     metal: 'gold', size: 'quarter', oz: 0.25 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.50',     metal: 'gold', size: 'half',    oz: 0.5 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=1',       metal: 'gold', size: '1oz',     oz: 1 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=32.15',   metal: 'gold', size: 'kilo',    oz: 32.15 },
  // 90% Constitutional / Junk Silver
  { url: 'https://www.findbullionprices.com/p/1-Face-Value-90-Percent-Junk-Silver-Coins/', metal: 'junk', size: '$1 fv', oz: 0.7234, tag: '$1 fv' },
  { url: 'https://www.findbullionprices.com/p/Junk-Silver-10-Dollar-Face-Value/', metal: 'junk', size: '$10 fv', oz: 7.234, tag: '$10 fv' },
  { url: 'https://www.findbullionprices.com/p/5-face-value-90-percent-silver-dimes/', metal: 'junk', size: '$5 fv', oz: 3.617, tag: '$5 fv' },
  { url: 'https://www.findbullionprices.com/p/90-junk-silver-coins-100-face-value-bag/', metal: 'junk', size: '$100 fv', oz: 72.34, tag: '$100 fv' },
  { url: 'https://www.findbullionprices.com/p/100-face-value-90-percent-junk-silver-half-dollars/', metal: 'junk', size: '$100 fv halves', oz: 72.34, tag: '$100 fv halves' },
];

function getTag(name) {
  const n = name.toLowerCase();
  if (n.includes('eagle') && n.includes('american')) return 'eagle';
  if (n.includes('maple'))                    return 'maple';
  if (n.includes('buffalo'))                  return 'buffalo';
  if (n.includes('britannia'))                return 'britannia';
  if (n.includes('krugerrand'))               return 'krugerrand';
  if (n.includes('kangaroo') || n.includes('nugget')) return 'kangaroo';
  if (n.includes('libertad'))                 return 'libertad';
  if (n.includes('panda'))                    return 'panda';
  if (n.includes('geiger'))                   return 'geiger';
  if (n.includes('scottsdale'))               return 'scottsdale';
    if (n.includes('dime')) return 'dimes';
  if (n.includes('half')) return 'halves';
  if (n.includes('quarter')) return 'quarters';
  if (n.includes('1000')) return '$1000 fv';
  if (n.includes('100')) return '$100 fv';
  if (n.includes('10 dollar')) return '$10 fv';
  if (n.includes('5 face')) return '$5 fv';
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

    const productName = stripHtml(cells[0]) || page.size || '';
    const dealerCell  = stripHtml(cells[1]);
    const premCell    = stripHtml(cells[2]);
    const priceCell   = stripHtml(cells[3]);

    if (!productName || !dealerCell || !priceCell) continue;
    if (productName.toLowerCase().includes('product') || premCell.toLowerCase().includes('premium')) continue;

    const dealerKey = Object.keys(DEALER_URLS).find(d => dealerCell.startsWith(d));
    if (!dealerKey) continue;

    if (page.metal !== 'junk' && /tube|roll|lot|bag|face value|junk|fractional|cull|milky|tarnish|scruffy|damaged|circulated/i.test(productName)) continue;

    const premMatch = premCell.replace(/[$,]/g, '').match(/^[-\d.]+/);
    if (!premMatch) continue;
    const prem = parseFloat(premMatch[0]);
    if (isNaN(prem) || prem < 0) continue;

    const priceMatch = priceCell.replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;

    const shipMatch = dealerCell.match(/Free\s+(?:Shipping\s+)?[@$][^\s]+(?:\s+\$[\d,]+)?/i);
    const ship = shipMatch ? shipMatch[0].replace(/\s+/g, ' ').trim() : '';

    // Extract FBP product path for URL enrichment
    const fbpHrefM = cells[0].match(/href="(\/p\/[^"]+)"/);
    const fbpPath  = fbpHrefM ? fbpHrefM[1] : null;

    results.push({
      size: page.size, name: productName, dealer: dealerKey,
      prem: Math.round(prem * 100) / 100,
      price: Math.round(price * 100) / 100,
      oz: page.oz, ship,
      url: DEALER_URLS[dealerKey], // replaced by enrichProductUrls()
      fbpPath, // internal — deleted after enrichment
      tag: page.tag || getTag(productName),
      verified: true,
    });
  }
  return results;
}

// Enrich deals with real product URLs using a persistent Blob cache.
// Only NEW fbpPaths (not yet in cache) are fetched — max 18 per run.
// This keeps HTTP trigger runs well under the 26s timeout while
// gradually building a complete cache across multiple runs.
// Parse FBP product pages (junk/90% silver) — different structure from closest-to-spot pages.
// Columns: Dealer | (qty) | Price Each | Credit Price | Dealer Premium | Buy
function parseJunkProductPage(html, page) {
  const results = [];
  const trRegex = /<tr\s+id="vendor_\d+"[\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];
  for (const row of rows) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let m;
    while ((m = tdRegex.exec(row)) !== null) cells.push(m[1]);
    if (cells.length < 5) continue;
    const dealerKey = Object.keys(DEALER_URLS).find(d => stripHtml(cells[0]).trim().startsWith(d));
    if (!dealerKey) continue;
    // td[2] = cash "Price Each"
    const priceMatch = stripHtml(cells[2]).replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;
    // td[4] = "Dealer Premium" contains "Y.YY% prem"
    const premPctMatch = stripHtml(cells[4]).match(/([\d.]+)%\s*prem/i);
    if (!premPctMatch) continue;
    const prem = parseFloat(premPctMatch[1]);
    if (isNaN(prem) || prem < 0) continue;
    // Buy URL — first https link in the row
    const hrefMatch = row.match(/href="(https?:\/\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : DEALER_URLS[dealerKey];
    results.push({
      size: page.size,
      name: page.size + ' 90% Silver',
      dealer: dealerKey,
      prem: Math.round(prem * 100) / 100,
      price: Math.round(price * 100) / 100,
      oz: page.oz,
      ship: '',
      url,
      tag: page.tag,
      verified: true,
    });
  }
  return results;
}

async function enrichProductUrls(allDeals, store) {
  const allPaths = [...new Set(
    [...allDeals.silver, ...allDeals.gold, ...allDeals.junk]
      .filter(d => d.fbpPath)
      .map(d => d.fbpPath)
  )];
  if (!allPaths.length) return;

  // Load persistent URL cache from Blob store
  let urlCache = {};
  try {
    const saved = await store.get('url-cache', { type: 'json' });
    if (saved && typeof saved === 'object') urlCache = saved;
  } catch (_) { /* first run — start fresh */ }

  const cachedCount  = allPaths.filter(p => urlCache[p]).length;
  const newPaths     = allPaths.filter(p => !urlCache[p]);
  console.log('  URL cache: ' + cachedCount + ' cached, ' + newPaths.length + ' new to fetch');

  // Fetch up to 90 new product pages this run — still well within budget,
  // and combined with the 3-hour schedule this clears the backlog fast
  // and keeps new listings enriched with real product links same-day.
  const toFetch = newPaths.slice(0, 90);

  const BATCH = 6; // 6 concurrent fetches × 4s timeout = ~4s per batch
  for (let i = 0; i < toFetch.length; i += BATCH) {
    await Promise.all(toFetch.slice(i, i + BATCH).map(async (fp) => {
      try {
        const r = await fetch('https://www.findbullionprices.com' + fp, {
          headers: HEADERS,
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) return;
        const html = await r.text();

        // <tr id="vendor_N"> rows contain direct dealer product hrefs:
        // <a href="https://dealer.com/product" ... class="dealer-link"
        //    title="Shop for X from DealerName">
        const vendorRows = html.match(/<tr id="vendor_\d+"[\s\S]*?<\/tr>/gi) || [];
        const map = {};
        for (const row of vendorRows) {
          const anchorM = row.match(/<a\b([^>]*)class="[^"]*dealer-link[^"]*"([^>]*)>/i);
          if (!anchorM) continue;
          const hM = (anchorM[1] + ' ' + anchorM[2]).match(/href="(https?:\/\/[^"]+)"/);
          if (!hM) continue;
          const nM = row.match(/title="[^"]*from ([^"]+)"/);
          const dealerName = nM ? nM[1].trim() : Object.keys(DEALER_URLS).find(d => row.includes(d));
          if (dealerName) map[dealerName] = hM[1];
        }
        if (Object.keys(map).length) urlCache[fp] = map;
      } catch (e) {
        console.warn('  enrich fail ' + fp + ': ' + e.message);
      }
    }));
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 300));
  }

  // Apply enriched URLs to every deal (silver + gold combined)
  let enriched = 0;
  for (const deal of [...allDeals.silver, ...allDeals.gold, ...allDeals.junk]) {
    if (deal.fbpPath && urlCache[deal.fbpPath]?.[deal.dealer]) {
      deal.url = urlCache[deal.fbpPath][deal.dealer];
      enriched++;
    }
    delete deal.fbpPath; // remove internal field before storing to blob
  }
  console.log('  enriched ' + enriched + '/' + (allDeals.silver.length + allDeals.gold.length + allDeals.junk.length) + ' deals with product URLs');

  // Persist updated URL cache for next run
  try {
    await store.set('url-cache', JSON.stringify(urlCache));
    console.log('  URL cache saved (' + Object.keys(urlCache).length + ' products)');
  } catch (e) {
    console.warn('  failed to save URL cache: ' + e.message);
  }
}

export default async (req) => {
  console.log('update-prices: starting', new Date().toISOString());
  const store = getStore('prices');
  const allDeals = { silver: [], gold: [], junk: [], updated: new Date().toISOString() };

  // Fetch all 11 FBP pages in parallel — ~3s total instead of ~9s sequential
  const results = await Promise.allSettled(
    FBP_PAGES.map(async (page) => {
      const resp = await fetch(page.url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html  = await resp.text();
      const deals = page.metal === 'junk' ? parseJunkProductPage(html, page) : parseDeals(html, page);
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
    // Enrich with real product URLs (uses persistent cache — only fetches new pages)
    await enrichProductUrls(allDeals, store);

    await store.set('latest', JSON.stringify(allDeals));
    console.log('update-prices: saved ' + allDeals.silver.length + ' silver + ' + allDeals.gold.length + ' gold + ' + allDeals.junk.length + ' junk deals');
  } else {
    console.warn('update-prices: too few deals (' + totalFetched + '), keeping cache');
  }

  // Debug mode: return enrichment details
  const isDebug = req.url.includes('debug=1');
  if (isDebug) {
    const allPaths2 = [...new Set(
      [...allDeals.silver, ...allDeals.gold]
        .filter(d => d.fbpPath)
        .map(d => d.fbpPath)
    )];
    const enrichedCount = [...allDeals.silver, ...allDeals.gold].filter(d => {
      const hp = /^https?:\/\/(www\.)?(sdbullion|apmex|moneymetals|monumentmetals|jmbullion|bullionexchanges|bgasc|herobullion|providentmetals|silvergoldbull|silver)\.(com|net)\/?$/i;
      return !hp.test(d.url);
    }).length;
    return new Response(JSON.stringify({
      total: totalFetched,
      allPaths: allPaths2.length,
      samplePaths: allPaths2.slice(0,5),
      enrichedDeals: enrichedCount,
      sampleDeals: [...allDeals.silver,...allDeals.gold].slice(0,3).map(d => ({dealer:d.dealer,url:d.url,fbpPath:d.fbpPath||'deleted'}))
    }), { headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} });
  }
  return new Response('OK: ' + totalFetched + ' deals');
};
// update-prices.mjs — Netlify Scheduled Function v2
// Runs daily at 6am UTC, scrapes FindBullionPrices.com,
// caches results + enriched product URLs to Netlify Blobs.
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
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=1',    metal: 'silver', size: '1oz',    oz: 1 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=5',    metal: 'silver', size: '5oz',    oz: 5 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=10',   metal: 'silver', size: '10oz',   oz: 10 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=100',  metal: 'silver', size: '100oz',  oz: 100 },
  { url: 'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=32.15',metal: 'silver', size: 'kilo',   oz: 32.15 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=0.03215', metal: 'gold', size: 'gram',    oz: 0.03215 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.10',     metal: 'gold', size: 'tenth',   oz: 0.1 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.25',     metal: 'gold', size: 'quarter', oz: 0.25 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=.50',     metal: 'gold', size: 'half',    oz: 0.5 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=1',       metal: 'gold', size: '1oz',     oz: 1 },
  { url: 'https://www.findbullionprices.com/gold/closest-to-spot.php?category=gold&type=&weight=32.15',   metal: 'gold', size: 'kilo',    oz: 32.15 },
  // 90% Constitutional / Junk Silver
  { url: 'https://www.findbullionprices.com/p/1-Face-Value-90-Percent-Junk-Silver-Coins/', metal: 'junk', size: '$1 fv', oz: 0.7234, tag: '$1 fv' },
  { url: 'https://www.findbullionprices.com/p/Junk-Silver-10-Dollar-Face-Value/', metal: 'junk', size: '$10 fv', oz: 7.234, tag: '$10 fv' },
  { url: 'https://www.findbullionprices.com/p/5-face-value-90-percent-silver-dimes/', metal: 'junk', size: '$5 fv', oz: 3.617, tag: '$5 fv' },
  { url: 'https://www.findbullionprices.com/p/90-junk-silver-coins-100-face-value-bag/', metal: 'junk', size: '$100 fv', oz: 72.34, tag: '$100 fv' },
  { url: 'https://www.findbullionprices.com/p/100-face-value-90-percent-junk-silver-half-dollars/', metal: 'junk', size: '$100 fv halves', oz: 72.34, tag: '$100 fv halves' },
];

function getTag(name) {
  const n = name.toLowerCase();
  if (n.includes('eagle') && n.includes('american')) return 'eagle';
  if (n.includes('maple'))                    return 'maple';
  if (n.includes('buffalo'))                  return 'buffalo';
  if (n.includes('britannia'))                return 'britannia';
  if (n.includes('krugerrand'))               return 'krugerrand';
  if (n.includes('kangaroo') || n.includes('nugget')) return 'kangaroo';
  if (n.includes('libertad'))                 return 'libertad';
  if (n.includes('panda'))                    return 'panda';
  if (n.includes('geiger'))                   return 'geiger';
  if (n.includes('scottsdale'))               return 'scottsdale';
    if (n.includes('dime')) return 'dimes';
  if (n.includes('half')) return 'halves';
  if (n.includes('quarter')) return 'quarters';
  if (n.includes('1000')) return '$1000 fv';
  if (n.includes('100')) return '$100 fv';
  if (n.includes('10 dollar')) return '$10 fv';
  if (n.includes('5 face')) return '$5 fv';
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

    const productName = stripHtml(cells[0]) || page.size || '';
    const dealerCell  = stripHtml(cells[1]);
    const premCell    = stripHtml(cells[2]);
    const priceCell   = stripHtml(cells[3]);

    if (!productName || !dealerCell || !priceCell) continue;
    if (productName.toLowerCase().includes('product') || premCell.toLowerCase().includes('premium')) continue;

    const dealerKey = Object.keys(DEALER_URLS).find(d => dealerCell.startsWith(d));
    if (!dealerKey) continue;

    if (page.metal !== 'junk' && /tube|roll|lot|bag|face value|junk|fractional|cull|milky|tarnish|scruffy|damaged|circulated/i.test(productName)) continue;

    const premMatch = premCell.replace(/[$,]/g, '').match(/^[-\d.]+/);
    if (!premMatch) continue;
    const prem = parseFloat(premMatch[0]);
    if (isNaN(prem) || prem < 0) continue;

    const priceMatch = priceCell.replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;

    const shipMatch = dealerCell.match(/Free\s+(?:Shipping\s+)?[@$][^\s]+(?:\s+\$[\d,]+)?/i);
    const ship = shipMatch ? shipMatch[0].replace(/\s+/g, ' ').trim() : '';

    // Extract FBP product path for URL enrichment
    const fbpHrefM = cells[0].match(/href="(\/p\/[^"]+)"/);
    const fbpPath  = fbpHrefM ? fbpHrefM[1] : null;

    results.push({
      size: page.size, name: productName, dealer: dealerKey,
      prem: Math.round(prem * 100) / 100,
      price: Math.round(price * 100) / 100,
      oz: page.oz, ship,
      url: DEALER_URLS[dealerKey], // replaced by enrichProductUrls()
      fbpPath, // internal — deleted after enrichment
      tag: page.tag || getTag(productName),
      verified: true,
    });
  }
  return results;
}

// Enrich deals with real product URLs using a persistent Blob cache.
// Only NEW fbpPaths (not yet in cache) are fetched — max 18 per run.
// This keeps HTTP trigger runs well under the 26s timeout while
// gradually building a complete cache across multiple runs.
// Parse FBP product pages (junk/90% silver) — different structure from closest-to-spot pages.
// Columns: Dealer | (qty) | Price Each | Credit Price | Dealer Premium | Buy
function parseJunkProductPage(html, page) {
  const results = [];
  const trRegex = /<tr\s+id="vendor_\d+"[\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];
  for (const row of rows) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let m;
    while ((m = tdRegex.exec(row)) !== null) cells.push(m[1]);
    if (cells.length < 5) continue;
    const dealerKey = Object.keys(DEALER_URLS).find(d => stripHtml(cells[0]).trim().startsWith(d));
    if (!dealerKey) continue;
    // td[2] = cash "Price Each"
    const priceMatch = stripHtml(cells[2]).replace(/,/g, '').match(/[\d.]+/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price) || price <= 0) continue;
    // td[4] = "Dealer Premium" contains "Y.YY% prem"
    const premPctMatch = stripHtml(cells[4]).match(/([\d.]+)%\s*prem/i);
    if (!premPctMatch) continue;
    const prem = parseFloat(premPctMatch[1]);
    if (isNaN(prem) || prem < 0) continue;
    // Buy URL — first https link in the row
    const hrefMatch = row.match(/href="(https?:\/\/[^"]+)"/);
    const url = hrefMatch ? hrefMatch[1] : DEALER_URLS[dealerKey];
    results.push({
      size: page.size,
      name: page.size + ' 90% Silver',
      dealer: dealerKey,
      prem: Math.round(prem * 100) / 100,
      price: Math.round(price * 100) / 100,
      oz: page.oz,
      ship: '',
      url,
      tag: page.tag,
      verified: true,
    });
  }
  return results;
}

async function enrichProductUrls(allDeals, store) {
  const allPaths = [...new Set(
    [...allDeals.silver, ...allDeals.gold, ...allDeals.junk]
      .filter(d => d.fbpPath)
      .map(d => d.fbpPath)
  )];
  if (!allPaths.length) return;

  // Load persistent URL cache from Blob store
  let urlCache = {};
  try {
    const saved = await store.get('url-cache', { type: 'json' });
    if (saved && typeof saved === 'object') urlCache = saved;
  } catch (_) { /* first run — start fresh */ }

  const cachedCount  = allPaths.filter(p => urlCache[p]).length;
  const newPaths     = allPaths.filter(p => !urlCache[p]);
  console.log('  URL cache: ' + cachedCount + ' cached, ' + newPaths.length + ' new to fetch');

  // Fetch up to 60 new product pages this run — still well within 26s budget
  const toFetch = newPaths.slice(0, 60);

  const BATCH = 6; // 6 concurrent fetches × 4s timeout = ~4s per batch
  for (let i = 0; i < toFetch.length; i += BATCH) {
    await Promise.all(toFetch.slice(i, i + BATCH).map(async (fp) => {
      try {
        const r = await fetch('https://www.findbullionprices.com' + fp, {
          headers: HEADERS,
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) return;
        const html = await r.text();

        // <tr id="vendor_N"> rows contain direct dealer product hrefs:
        // <a href="https://dealer.com/product" ... class="dealer-link"
        //    title="Shop for X from DealerName">
        const vendorRows = html.match(/<tr id="vendor_\d+"[\s\S]*?<\/tr>/gi) || [];
        const map = {};
        for (const row of vendorRows) {
          const anchorM = row.match(/<a\b([^>]*)class="[^"]*dealer-link[^"]*"([^>]*)>/i);
          if (!anchorM) continue;
          const hM = (anchorM[1] + ' ' + anchorM[2]).match(/href="(https?:\/\/[^"]+)"/);
          if (!hM) continue;
          const nM = row.match(/title="[^"]*from ([^"]+)"/);
          const dealerName = nM ? nM[1].trim() : Object.keys(DEALER_URLS).find(d => row.includes(d));
          if (dealerName) map[dealerName] = hM[1];
        }
        if (Object.keys(map).length) urlCache[fp] = map;
      } catch (e) {
        console.warn('  enrich fail ' + fp + ': ' + e.message);
      }
    }));
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 300));
  }

  // Apply enriched URLs to every deal (silver + gold combined)
  let enriched = 0;
  for (const deal of [...allDeals.silver, ...allDeals.gold, ...allDeals.junk]) {
    if (deal.fbpPath && urlCache[deal.fbpPath]?.[deal.dealer]) {
      deal.url = urlCache[deal.fbpPath][deal.dealer];
      enriched++;
    }
    delete deal.fbpPath; // remove internal field before storing to blob
  }
  console.log('  enriched ' + enriched + '/' + (allDeals.silver.length + allDeals.gold.length + allDeals.junk.length) + ' deals with product URLs');

  // Persist updated URL cache for next run
  try {
    await store.set('url-cache', JSON.stringify(urlCache));
    console.log('  URL cache saved (' + Object.keys(urlCache).length + ' products)');
  } catch (e) {
    console.warn('  failed to save URL cache: ' + e.message);
  }
}

export default async (req) => {
  console.log('update-prices: starting', new Date().toISOString());
  const store = getStore('prices');
  const allDeals = { silver: [], gold: [], junk: [], updated: new Date().toISOString() };

  // Fetch all 11 FBP pages in parallel — ~3s total instead of ~9s sequential
  const results = await Promise.allSettled(
    FBP_PAGES.map(async (page) => {
      const resp = await fetch(page.url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html  = await resp.text();
      const deals = page.metal === 'junk' ? parseJunkProductPage(html, page) : parseDeals(html, page);
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
    // Enrich with real product URLs (uses persistent cache — only fetches new pages)
    await enrichProductUrls(allDeals, store);

    await store.set('latest', JSON.stringify(allDeals));
    console.log('update-prices: saved ' + allDeals.silver.length + ' silver + ' + allDeals.gold.length + ' gold + ' + allDeals.junk.length + ' junk deals');
  } else {
    console.warn('update-prices: too few deals (' + totalFetched + '), keeping cache');
  }

  // Debug mode: return enrichment details
  const isDebug = req.url.includes('debug=1');
  if (isDebug) {
    const allPaths2 = [...new Set(
      [...allDeals.silver, ...allDeals.gold]
        .filter(d => d.fbpPath)
        .map(d => d.fbpPath)
    )];
    const enrichedCount = [...allDeals.silver, ...allDeals.gold].filter(d => {
      const hp = /^https?:\/\/(www\.)?(sdbullion|apmex|moneymetals|monumentmetals|jmbullion|bullionexchanges|bgasc|herobullion|providentmetals|silvergoldbull|silver)\.(com|net)\/?$/i;
      return !hp.test(d.url);
    }).length;
    return new Response(JSON.stringify({
      total: totalFetched,
      allPaths: allPaths2.length,
      samplePaths: allPaths2.slice(0,5),
      enrichedDeals: enrichedCount,
      sampleDeals: [...allDeals.silver,...allDeals.gold].slice(0,3).map(d => ({dealer:d.dealer,url:d.url,fbpPath:d.fbpPath||'deleted'}))
    }), { headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} });
  }
  return new Response('OK: ' + totalFetched + ' deals');
};
