const cache = {};
const tokenCache = { token: null, expiry: 0 };
const CACHE_TTL = 30 * 60 * 1000;

// EPN affiliate tracking — Campaign ID 5339146590
function addAffiliate(url) {
    if (!url || url === '#') return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
}

async function getAccessToken(clientId, clientSecret) {
    if (tokenCache.token && Date.now() < tokenCache.expiry - 60000) {
          return tokenCache.token;
    }
    const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('OAuth failed: ' + (data.error_description || JSON.stringify(data)));
    tokenCache.token = data.access_token;
    tokenCache.expiry = Date.now() + (data.expires_in * 1000);
    return tokenCache.token;
}

exports.handler = async function(event) {
    const query = event.queryStringParameters?.query || '';
    if (!query.trim()) {
          return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Query parameter is required' }) };
    }
    const clientId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
          return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'eBay API credentials not configured. Add EBAY_CLIENT_SECRET to Netlify environment variables.' }) };
    }
    const cacheKey = query.toLowerCase().trim();
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: cached.body };
    }
    try {
          const token = await getAccessToken(clientId, clientSecret);
          const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
            + '?q=' + encodeURIComponent(query)
            + '&limit=12';
          const res = await fetch(searchUrl, {
                  headers: { 'Authorization': 'Bearer ' + token, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
          });
          const data = await res.json();
          if (data.errors) {
                  const errMsg = data.errors[0]?.message || 'eBay API error';
                  return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: errMsg }) };
          }
          const items = data.itemSummaries || [];
          const results = items.map(item => ({
                  title: item.title || 'Unknown',
                  price: parseFloat(item.price?.value || 0).toFixed(2),
                  currency: item.price?.currency || 'USD',
                  buyItNow: item.buyingOptions?.includes('FIXED_PRICE') || false,
                  listingType: item.buyingOptions?.[0] || '',
                  endTime: item.itemEndDate || '',
                  image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
                  url: addAffiliate(item.itemWebUrl || '#'),
                  condition: item.condition || '',
                  seller: item.seller?.username || '',
                  feedbackScore: item.seller?.feedbackScore?.toString() || '',
                  shippingCost: item.shippingOptions?.[0]?.shippingCost?.value || '0'
          }));
          const responseBody = JSON.stringify(results);
          cache[cacheKey] = { ts: Date.now(), body: responseBody };
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: responseBody };
        c}o ncsatt ccha c(heer r=)  {{}
                                     ; 
   c o nrsett utronk e{n Csatcahteu s=C o{d et:o k5e0n0:,  nhuelald,e resx:p i{r y':A c0c e}s;s
     -cCoonnsttr oClA-CAHlEl_oTwT-LO r=i g3i0n '*:  6'0* '*  }1,0 0b0o;d
     y
                                                                               :/ /J SEOPNN. satfrfiinlgiiaftye( {t rearcrkoirn:g  '— FCaaimlpeadi gtno  IfDe t5c3h3 9e1B4a6y5 9d0a
                                                                                                                  tfau:n c't i+o ne rard.dmAefsfsialgiea t}e)( u}r;l
     )   {}

                                                                              } ;if (!url || url === '#') return url;
                                            const sep = url.includes('?') ? '&' : '?';
                                            return url + sep + 'mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339146590&toolid=10001';
                                         }

                                     async function getAccessToken(clientId, clientSecret) {
                                         if (tokenCache.token && Date.now() < tokenCache.expiry - 60000) {
                                               return tokenCache.token;
                                         }
                                         const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
                                         const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
                                               method: 'POST',
                                               headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
                                               body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
                                         });
                                         const data = await res.json();
                                         if (!data.access_token) throw new Error('OAuth failed: ' + (data.error_description || JSON.stringify(data)));
                                         tokenCache.token = data.access_token;
                                         tokenCache.expiry = Date.now() + (data.expires_in * 1000);
                                         return tokenCache.token;
                                     }

                                     exports.handler = async function(event) {
                                         const query = event.queryStringParameters?.query || '';
                                         if (!query.trim()) {
                                               return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Query parameter is required' }) };
                                         }
                                         const clientId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID;
                                         const clientSecret = process.env.EBAY_CLIENT_SECRET;
                                         if (!clientId || !clientSecret) {
                                               return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'eBay API credentials not configured. Add EBAY_CLIENT_SECRET to Netlify environment variables.' }) };
                                         }
                                         const cacheKey = query.toLowerCase().trim();
                                         const cached = cache[cacheKey];
                                         if (cached && Date.now() - cached.ts < CACHE_TTL) {
                                               return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: cached.body };
                                         }
                                         try {
                                               const token = await getAccessToken(clientId, clientSecret);
                                               const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
                                                 + '?q=' + encodeURIComponent(query)
                                                 + '&limit=12';
                                               const res = await fetch(searchUrl, {
                                                       headers: { 'Authorization': 'Bearer ' + token, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                                               });
                                               const data = await res.json();
                                               if (data.errors) {
                                                       const errMsg = data.errors[0]?.message || 'eBay API error';
                                                       return { statusCode: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: errMsg }) };
                                               }
                                               const items = data.itemSummaries || [];
                                               const results = items.map(item => ({
                                                       title: item.title || 'Unknown',
                                                       price: parseFloat(item.price?.value || 0).toFixed(2),
                                                       currency: item.price?.currency || 'USD',
                                                       buyItNow: item.buyingOptions?.includes('FIXED_PRICE') || false,
                                                       listingType: item.buyingOptions?.[0] || '',
                                                       endTime: item.itemEndDate || '',
                                                       image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
                                                       url: addAffiliate(item.itemWebUrl || '#'),
                                                       condition: item.condition || '',
                                                       seller: item.seller?.username || '',
                                                       feedbackScore: item.seller?.feedbackScore?.toString() || '',
                                                       shippingCost: item.shippingOptions?.[0]?.shippingCost?.value || '0'
                                               }));
                                               const responseBody = JSON.stringify(results);
                                               cache[cacheKey] = { ts: Date.now(), body: responseBody };
                                               return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }, body: responseBody };
                                         } catch (err) {
                                               return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Failed to fetch eBay data: ' + err.message }) };
                                         }
                                     };
