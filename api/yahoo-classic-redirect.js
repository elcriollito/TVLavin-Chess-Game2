export default function handler(req, res) {
    res.setHeader('Location', '/yahoo-classic');
    return res.status(308).end();
}
