const binanceSpot = [
  '/api/v3/time',
  '/api/v3/exchangeInfo',
  '/api/v3/account',
  '/api/v3/myTrades',
  '/sapi/v1/capital/deposit/hisrec',
  '/sapi/v1/capital/withdraw/history',
  '/sapi/v1/convert/tradeFlow',
  '/sapi/v1/asset/assetDividend',
  '/sapi/v1/fiat/payments',
];

const weexHeaders = [
  'access-key', 'access-sign', 'access-timestamp',
  'access-passphrase', 'locale',
];

const rules = new Map();

for (const host of [
  'api.binance.com', 'api-gcp.binance.com',
  'api1.binance.com', 'api2.binance.com',
  'api3.binance.com', 'api4.binance.com',
]) {
  rules.set(host, {
    paths: binanceSpot,
    headers: ['x-mbx-apikey'],
  });
}

rules.set('data-api.binance.vision', {
  paths: ['/api/v3/time', '/api/v3/exchangeInfo'],
  headers: [],
});

rules.set('fapi.binance.com', {
  paths: [
    '/fapi/v1/income',
    '/fapi/v2/positionRisk',
    '/fapi/v2/balance',
  ],
  headers: ['x-mbx-apikey'],
});

rules.set('api.mexc.com', {
  paths: [
    '/api/v3/time',
    '/api/v3/exchangeInfo',
    '/api/v3/account',
    '/api/v3/myTrades',
    '/api/v3/capital/deposit/hisrec',
    '/api/v3/capital/withdraw/history',
  ],
  headers: ['x-mexc-apikey'],
});

rules.set('api-spot.weex.com', {
  paths: ['/api/v2/trade/fills', '/api/v2/account/assets'],
  headers: weexHeaders,
});

rules.set('api-contract.weex.com', {
  paths: ['/capi/v2/order/fills', '/capi/v2/account/assets'],
  headers: weexHeaders,
});

rules.set('fapi.bitunix.com', {
  paths: [
    '/api/v1/futures/trade/get_history_trades',
    '/api/v1/futures/account',
    '/api/v1/futures/position/get_pending_positions',
  ],
  headers: ['api-key', 'nonce', 'timestamp', 'sign'],
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Nur GET erlaubt' });
  }

  const secret = process.env.RELAY_TOKEN;
  if (!secret) {
    return res.status(503).json({ error: 'RELAY_TOKEN fehlt' });
  }

  if (typeof req.query.token !== 'string' || req.query.token !== secret) {
    return res.status(401).json({ error: 'Zugangscode ungültig' });
  }

  if (typeof req.query.url !== 'string') {
    return res.status(400).json({ error: 'Zieladresse fehlt' });
  }

  let target;
  try {
    target = new URL(req.query.url);
  } catch {
    return res.status(400).json({ error: 'Zieladresse ungültig' });
  }

  const rule = rules.get(target.hostname);
  if (
    target.protocol !== 'https:' ||
    !rule ||
    !rule.paths.includes(target.pathname) ||
    target.username || target.password ||
    (target.port && target.port !== '443')
  ) {
    return res.status(403).json({ error: 'Ziel nicht erlaubt' });
  }

  const headers = { Accept: 'application/json' };
  for (const name of rule.headers) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  try {
    const upstream = await fetch(target.href, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });

    const body = await upstream.text();
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json'
    );
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) res.setHeader('Retry-After', retryAfter);

    return res.status(upstream.status).send(body);
  } catch {
    return res.status(502).json({ error: 'Börse nicht erreichbar' });
  }
}
