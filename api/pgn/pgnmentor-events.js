const MAX_BYTES = 10 * 1024 * 1024;

const EVENT_PATTERNS = Object.freeze([
  /^WorldChamp(18(?:86|89|90|92|94|96)|19(?:07|08|09|10[ab]?|21|27|29|34|35|37|48|51|54|57|58|60|61|63|66|69|72|78|81|84|85|86|87|90)|20(?:00|04|06|07|08|10|12|13|14|16|18|21|23|24))\.pgn$/,
  /^FideChamp(1993|1996|1998|1999|2000|2002|2004|2005)\.pgn$/,
  /^PCAChamp(1993|1995)\.pgn$/,
  /^Candidates(1950|1953|1956|1959|1962|1965|1968|1971|1974|1977|1980|1983|1985r?|1988|1990|1994|2011|2013|2014|2016|2018|2020|2022|2024)\.pgn$/,
  /^WorldCup(2005|2007|2009|2011|2013|2015|2021|2023)\.pgn$/,
  /^WccQual(1998|2002|2007|2009)\.pgn$/,
  /^PCACand1994\.pgn$/,
  /^PCAQual1993\.pgn$/,
  /^Interzonal(1948|1952|1955|1958|1962|1964|1967|1970|1973[ab]|1976[ab]|1979[ab]|1982[abc]|1985[abc]|1987[abc]|1990|1993)\.pgn$/
]);

function isAllowed(file) {
  return typeof file === 'string' && EVENT_PATTERNS.some(pattern => pattern.test(file));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const file = Array.isArray(req.query?.file) ? req.query.file[0] : req.query?.file;
  if (!isAllowed(file)) {
    return res.status(404).json({ error: 'Unknown PGN Mentor event collection' });
  }

  const upstreamUrl = `https://www.pgnmentor.com/events/${encodeURIComponent(file)}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        Accept: 'application/x-chess-pgn,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'CAISSA-Chess-PGN-Proxy/1.0 (+https://www.caissa-chess.org/)'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'PGN source unavailable' });
    }

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) {
      return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
    }

    res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-CAISSA-PGN-Source', 'PGN-Mentor-Events');

    if (req.method === 'HEAD') return res.status(200).end();

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > MAX_BYTES) {
      return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
    }
    if (!body.includes(Buffer.from('[Event '))) {
      return res.status(502).json({ error: 'PGN source returned an invalid payload' });
    }

    return res.status(200).send(body);
  } catch (_) {
    return res.status(502).json({ error: 'PGN source unavailable' });
  }
}
