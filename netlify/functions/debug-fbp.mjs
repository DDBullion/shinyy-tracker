// debug-fbp.mjs — diagnostic for FBP page structure
export default async (req) => {
  const url  = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'allcells';
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
    const vendorRows = html.match(/<tr id="vendor_\d+"[\s\S]*?<\/tr>/gi) || [];
    const parsed = vendorRows.slice(0, 8).map(row => {
      const hM = row.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*dealer-link/);
      const nM = row.match(/title="[^"]*from ([^"]+)"/);
      return { dealer: nM ? nM[1].trim() : null, url: hM ? hM[1] : null };
    });
    return new Response(JSON.stringify({ vendorRowCount: vendorRows.length, parsed }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // allcells mode: show all cells of rows that have our tracked dealers
  const DEALERS = ['SD Bullion','APMEX','Money Metals Exchange','Monument Metals',
    'JM Bullion','Bullion Exchanges','BGASC','Hero Bullion','Provident Metals',
    'Silver Gold Bull','Silver.com'];

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
    if (!DEALERS.some(d => dealerText.startsWith(d))) continue;

    // Show raw HTML of ALL cells (to find buy links)
    result.push({
      dealerText: dealerText.slice(0,60),
      cellCount: cells.length,
      allCells: cells.map((c, i) => ({ i, raw: c.slice(0, 400) }))
    });
    if (result.length >= 4) break;
  }

  return new Response(JSON.stringify({ totalRows: rows.length, matched: result }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
