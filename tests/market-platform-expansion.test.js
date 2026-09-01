import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import {
    MARKET_PRODUCT_SCHEMAS,
    MARKET_PRODUCT_TYPES,
    getMarketProduct,
    listAffiliateRecommendations,
    listPdfProducts,
    listSoftwareProducts,
    validateMarketCatalog,
    validateMarketProduct
} from '../api/_lib/market-product-catalog.js';
import {
    MARKET_READER_PRODUCT_ID,
    MARKET_READER_RC1_BLOB_PATHNAME,
    MARKET_READER_RC1_RELEASE_ID,
    MARKET_READER_RC1_SHA256
} from '../api/_lib/market-reader-releases.js';

const MARKET_PAGES = [
    'market.html',
    'market-reader.html',
    'market-books.html',
    'market-recommendations.html',
    'account-downloads.html'
];
const NAVIGATION = [
    ['/market/software', 'Software'],
    ['/market/books', 'Books & PDFs'],
    ['/market/recommendations', 'Recommendations'],
    ['/account/downloads', 'My Downloads']
];

function documentFor(path) {
    return load(fs.readFileSync(path, 'utf8'));
}

test('public catalog exposes one real software product and no placeholder products', () => {
    assert.equal(validateMarketCatalog(), true);
    assert.equal(listSoftwareProducts().length, 1);
    assert.equal(listPdfProducts().length, 0);
    assert.equal(listAffiliateRecommendations().length, 0);

    const reader = getMarketProduct(MARKET_READER_PRODUCT_ID);
    assert.equal(validateMarketProduct(reader), true);
    assert.equal(reader.productType, MARKET_PRODUCT_TYPES.SOFTWARE);
    assert.equal(reader.version, MARKET_READER_RC1_RELEASE_ID);
    assert.equal(reader.releaseStatus, 'prelaunch');
    assert.equal(reader.priceDisplay, 'Not on sale');
    assert.equal(reader.releaseMapping, 'server-owned-private-blob');
    assert.equal(JSON.stringify(reader).includes(MARKET_READER_RC1_BLOB_PATHNAME), false);
    assert.equal(Object.hasOwn(reader, 'pathname'), false);
});

test('software, PDF and affiliate schemas prepare the required extensible fields', () => {
    assert.deepEqual(MARKET_PRODUCT_SCHEMAS.software, [
        'productId', 'productType', 'title', 'image', 'platform', 'version',
        'shortDescription', 'description', 'features', 'priceDisplay',
        'releaseStatus', 'entitlementRequirement', 'downloadsPath', 'releaseMapping'
    ]);
    assert.deepEqual(MARKET_PRODUCT_SCHEMAS.pdf, [
        'productId', 'productType', 'title', 'author', 'cover', 'language',
        'pageCount', 'description', 'priceDisplay', 'edition', 'releaseId',
        'entitlementRequirement', 'releaseMapping'
    ]);
    assert.deepEqual(MARKET_PRODUCT_SCHEMAS.affiliate, [
        'productId', 'productType', 'title', 'image', 'category', 'merchant',
        'recommendation', 'externalUrl', 'affiliateDisclosure'
    ]);
});

test('all Market pages expose the complete named navigation with one current section', () => {
    for (const page of MARKET_PAGES) {
        const $ = documentFor(page);
        assert.equal($('nav[aria-label="Market navigation"]').length, 1, page);
        for (const [href, text] of NAVIGATION) {
            const link = $(`nav[aria-label="Market navigation"] a[href="${href}"]`);
            assert.equal(link.length, 1, `${page}: ${href}`);
            assert.equal(link.text().trim(), text, `${page}: ${text}`);
        }
        assert.equal($('nav[aria-label="Market navigation"] a[aria-current="page"]').length, 1, page);
    }
});

test('Vercel routes each Market section to its literal static page', () => {
    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
    assert.equal(rewrites.get('/market'), '/market.html');
    assert.equal(rewrites.get('/market/software'), '/market.html');
    assert.equal(rewrites.get('/market/caissa-pgn-reader'), '/market-reader.html');
    assert.equal(rewrites.get('/market/books'), '/market-books.html');
    assert.equal(rewrites.get('/market/recommendations'), '/market-recommendations.html');
    assert.equal(rewrites.get('/account/downloads'), '/account-downloads.html');
});

test('Reader page contains product, requirements, license, delivery and FAQ without enabling production Buy', () => {
    const $ = documentFor('market-reader.html');
    assert.equal($('h1').text().trim(), 'CAISSA PGN Reader');
    assert.match($('main').text(), /Windows x64/);
    assert.match($('main').text(), /1\.0\.0-rc1/);
    assert.match($('main').text(), /Requirements/);
    assert.match($('main').text(), /License/);
    assert.match($('main').text(), /Private delivery/);
    assert.equal($('.market-faq details').length >= 5, true);
    assert.equal($('button:contains("Buy — not enabled")').is('[disabled]'), true);
    assert.equal($('a[href="/account/downloads"]').length >= 2, true);
    assert.doesNotMatch($.html(), /checkout\.stripe\.com|PRODUCTION_MARKET_DOWNLOADS_ENABLED\s*=\s*true/);
});

test('Books foundation has no fictional title, cover, price or purchase control', () => {
    const $ = documentFor('market-books.html');
    assert.match($('main').text(), /No PDF titles are published or offered for sale yet/);
    assert.match($('main').text(), /No books released yet/);
    assert.equal($('.market-software-card, .market-download-card').length, 0);
    assert.equal($('button, a').filter((_, node) => /buy|purchase/i.test($(node).text())).length, 0);
});

test('recommendations are visibly external and contain no merchant or affiliate configuration', () => {
    const source = fs.readFileSync('market-recommendations.html', 'utf8');
    const $ = load(source);
    assert.match($('main').text(), /External recommendations/);
    assert.match($('main').text(), /Not sold by CAISSA/);
    assert.match($('main').text(), /View at retailer/);
    assert.match($('main').text(), /Hidden catalog · 0 items/);
    assert.equal($('main a[href^="http"]').length, 0);
    assert.doesNotMatch(source, /amazon|associate\s+id\b|tracking\s+id\b/i);
});

test('Market assets are local and mobile CSS keeps named controls touch sized', () => {
    for (const page of MARKET_PAGES) {
        const $ = documentFor(page);
        $('link[href], script[src], img[src]').each((_, node) => {
            const value = $(node).attr('href') || $(node).attr('src');
            assert.match(value, /^\//, `${page}: ${value}`);
        });
    }
    const css = fs.readFileSync('css/caissa-market.css', 'utf8');
    assert.match(css, /@media \(max-width: 600px\)/);
    assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.market-nav a \{ min-width: 0; min-height: 44px;/);
});

test('certified Reader release identity remains unchanged behind the extensible catalog', () => {
    assert.equal(MARKET_READER_PRODUCT_ID, 'caissa-pgn-reader');
    assert.equal(MARKET_READER_RC1_RELEASE_ID, '1.0.0-rc1');
    assert.equal(MARKET_READER_RC1_SHA256, '9FC58B593C1E7774DC2E326DBE91635973D3FD18AA718F73C3B2C0869641EE88');
    assert.equal(MARKET_READER_RC1_BLOB_PATHNAME, 'products/caissa-pgn-reader/1.0.0-rc1/CAISSA-PGN-Reader-v1.0.0-rc1-windows-x64-portable.zip');
});
