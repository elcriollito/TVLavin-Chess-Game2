const ALLOWED_FILES = new Set([
    "Adolf Anderssen.pgn",
    "Alexander Alekhine.pgn",
    "Alexander Grischuk.pgn",
    "Alexander Morozevich.pgn",
    "Alexandra Kosteniuk.pgn",
    "Alexey Shirov.pgn",
    "Alireza Firouzja.pgn",
    "Anatoly Karpov.pgn",
    "Anish Giri.pgn",
    "Arjun Erigaisi.pgn",
    "Bobby Fischer.pgn",
    "Boris Gelfand.pgn",
    "Boris Spassky.pgn",
    "Daniil Dubov.pgn",
    "David Janowski.pgn",
    "Ding Liren.pgn",
    "Dommaraju Gukesh.pgn",
    "Emanuel Lasker.pgn",
    "Fabiano Caruana.pgn",
    "Frank Marshall.pgn",
    "Garry Kasparov.pgn",
    "Gata Kamsky.pgn",
    "Hans Niemann.pgn",
    "Hikaru Nakamura.pgn",
    "Hou Yifan.pgn",
    "Ian Nepomniachtchi.pgn",
    "Jan-Krzysztof Duda.pgn",
    "Johannes Zukertort.pgn",
    "Ju Wenjun.pgn",
    "Judit Polgar.pgn",
    "Levon Aronian.pgn",
    "Loek van Wely.pgn",
    "Magnus Carlsen.pgn",
    "Max Euwe.pgn",
    "Maxime Vachier-Lagrave.pgn",
    "Michael Adams.pgn",
    "Mikhail Botvinnik.pgn",
    "Mikhail Tal.pgn",
    "Nigel Short.pgn",
    "Nodirbek Abdusattorov.pgn",
    "Paul Keres.pgn",
    "Paul Morphy.pgn",
    "Peter Leko.pgn",
    "Peter Svidler.pgn",
    "Rameshbabu Praggnanandhaa.pgn",
    "Richard Rapport.pgn",
    "Samuel Reshevsky.pgn",
    "Samuel Shankland.pgn",
    "Sergey Karjakin.pgn",
    "Shakhriyar Mamedyarov.pgn",
    "Siegbert Tarrasch.pgn",
    "Teimour Radjabov.pgn",
    "Tigran Petrosian.pgn",
    "Vasily Smyslov.pgn",
    "Vassily Ivanchuk.pgn",
    "Veselin Topalov.pgn",
    "Viktor Korchnoi.pgn",
    "Vincent Keymer.pgn",
    "Viswanathan Anand.pgn",
    "Vladimir Kramnik.pgn",
    "Wang Hao.pgn",
    "Wei Yi.pgn",
    "Wesley So.pgn",
    "Wilhelm Steinitz.pgn",
    "Yu Yangyi.pgn"
]);
const MAX_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const requested = Array.isArray(req.query?.file) ? req.query.file[0] : req.query?.file;
    if (!requested || !ALLOWED_FILES.has(requested)) {
        return res.status(404).json({ error: 'Unknown PGN collection' });
    }

    const upstreamUrl = `https://www.smallchess.com/Games/${encodeURIComponent(requested)}`;

    try {
        const upstream = await fetch(upstreamUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: { Accept: 'text/plain, application/x-chess-pgn;q=0.9, */*;q=0.1' }
        });

        if (!upstream.ok) {
            return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'PGN source unavailable' });
        }

        const declaredLength = Number(upstream.headers.get('content-length') || 0);
        if (declaredLength > MAX_BYTES) {
            return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
        }

        res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        if (req.method === 'HEAD') return res.status(200).end();

        const body = Buffer.from(await upstream.arrayBuffer());
        if (body.byteLength > MAX_BYTES) {
            return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
        }

        return res.status(200).send(body);
    } catch (_) {
        return res.status(502).json({ error: 'PGN source unavailable' });
    }
}
