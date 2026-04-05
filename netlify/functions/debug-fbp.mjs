// debug-fbp.mjs — temporary diagnostic: shows raw cell HTML from FBP comparison page
export default async (req) => {
  const url = new URL(req.url);
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

  // Find rows with 4+ td cells
  const trRegex = /<tr[\s>][\s\S]*?<\/tr>/gi;
  const rows = html.match(trRegex) || [];
  const dataRows = [];
  for (const row of rows) {
    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (tds.length >= 4) {
      dataRows.push({
        cell0_raw: tds[0].slice(0, 500),
        cell1_raw: tds[1].slice(0, 500),
        cell2_raw: tds[2].slice(0, 300),
        cell3_raw: tds[3].slice(0, 300),
      });
      if (dataRows.length >= 5) break;
    }
  }

  return new Response(JSON.stringify(dataRows, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
