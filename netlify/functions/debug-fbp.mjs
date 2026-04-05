// debug-fbp.mjs — diagnostic: inspect FBP comparison + product pages
export default async (req) => {
  const url  = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'compare'; // 'compare' | 'product'
  const page = url.searchParams.get('page') ||
    'https://www.findbullionprices.com/closest-to-spot/?category=silver&weight=1';

  const resp = await fetch(page, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(12000),
  });
  const html = await resp.text();

  if (mode === 'product') {
    // Show vendor rows: <tr id="vendor_N">
    const vendorRows = html.match(/<tr id="vendor_\d+"[\s\S]*?<\/tr>/gi) || [];
    const parsed = vendorRows.slice(0, 8).map(row => {
      const hM = row.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*dealer-link/);
      const nM = row.match(/title="[^"]*from ([^"]+)"/);
      return {
        dealer:  nM ? nM[1].trim() : null,
        url:     hM ? hM[1] : null,
        raw_100: row.slice(0, 300),
      };
    });
    return new Response(JSON.stringify({ vendorRowCount: vendorRows.length, parsed }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // mode === 'compare': find comparison table rows and extract fbpPaths
  const DEALER_URLS = {
    'SD Bullion':'x','APMEX':'x','Money Metals Exchange':'x','Monument Metals':'x',
    'JM Bullion':'x','Bullion Exchanges':'x','BGASC':'x','Hero Bullion':'x',
    'Provident Metals':'x','Silver Gold Bull':'x','Silver.com':'x',
  };
  const trRegex = /<tr[\s>][\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];
  const result = [];
  for (const row of rows) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let m;
    while ((m = tdRegex.exec(row)) !== null) cells.push(m[1]);
    if (cells.length < 4) continue;
    const dealerText = cells[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const dealerKey  = Object.keys(DEALER_URLS).find(d => dealerText.startsWith(d));
    if (!dealerKey) continue;
    const fbpM = cells[0].match(/href="(\/p\/[^"]+)"/);
    result.push({
      dealer: dealerKey,
      fbpPath: fbpM ? fbpM[1] : null,
      cell0_short: cells[0].slice(0, 200),
    });
    if (result.length >= 10) break;
  }
  return new Response(JSON.stringify({ totalRows: rows.length, matched: result }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
