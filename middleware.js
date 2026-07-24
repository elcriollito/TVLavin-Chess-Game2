export const config = {
    matcher: '/'
};

export default function middleware(request) {
    const url = new URL(request.url);
    if (url.searchParams.get('section') !== 'yahooClassic') return;

    return Response.redirect(new URL('/yahoo-classic', url), 308);
}
