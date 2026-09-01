import {
    MARKET_READER_PRODUCT_ID,
    MARKET_READER_RC1_RELEASE_ID
} from './market-reader-releases.js';

export const MARKET_PRODUCT_TYPES = Object.freeze({
    SOFTWARE: 'software',
    PDF: 'pdf',
    AFFILIATE: 'affiliate'
});

export const MARKET_PRODUCT_SCHEMAS = Object.freeze({
    software: Object.freeze([
        'productId',
        'productType',
        'title',
        'image',
        'platform',
        'version',
        'shortDescription',
        'description',
        'features',
        'priceDisplay',
        'releaseStatus',
        'entitlementRequirement',
        'downloadsPath',
        'releaseMapping'
    ]),
    pdf: Object.freeze([
        'productId',
        'productType',
        'title',
        'author',
        'cover',
        'language',
        'pageCount',
        'description',
        'priceDisplay',
        'edition',
        'releaseId',
        'entitlementRequirement',
        'releaseMapping'
    ]),
    affiliate: Object.freeze([
        'productId',
        'productType',
        'title',
        'image',
        'category',
        'merchant',
        'recommendation',
        'externalUrl',
        'affiliateDisclosure'
    ])
});

const CAISSA_PGN_READER = Object.freeze({
    productId: MARKET_READER_PRODUCT_ID,
    productType: MARKET_PRODUCT_TYPES.SOFTWARE,
    title: 'CAISSA PGN Reader',
    image: '/public/market/caissa-pgn-reader.svg',
    platform: 'Windows x64',
    version: MARKET_READER_RC1_RELEASE_ID,
    shortDescription: 'A focused Windows workspace for reading, organizing and replaying PGN games.',
    description: 'Review local PGN collections with navigation, notation, albums and optional local engine analysis.',
    features: Object.freeze([
        'Portable Windows workspace',
        'PGN navigation and notation',
        'Albums and integrated Lichess sample',
        'English and Spanish interface'
    ]),
    priceDisplay: 'Not on sale',
    releaseStatus: 'prelaunch',
    entitlementRequirement: 'purchase-or-authorized-staging-fixture',
    downloadsPath: '/account/downloads',
    releaseMapping: 'server-owned-private-blob'
});

const SOFTWARE_PRODUCTS = Object.freeze([CAISSA_PGN_READER]);
const PDF_PRODUCTS = Object.freeze([]);
const AFFILIATE_RECOMMENDATIONS = Object.freeze([]);

function hasRequiredFields(product, type) {
    return MARKET_PRODUCT_SCHEMAS[type].every((field) => Object.hasOwn(product, field));
}

export function validateMarketProduct(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return false;
    const type = product.productType;
    if (!Object.hasOwn(MARKET_PRODUCT_SCHEMAS, type) || !hasRequiredFields(product, type)) return false;
    if (!/^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(String(product.productId || ''))) return false;
    if (Object.hasOwn(product, 'pathname') || Object.hasOwn(product, 'blobPathname')) return false;

    if (type === MARKET_PRODUCT_TYPES.AFFILIATE) {
        return typeof product.affiliateDisclosure === 'boolean'
            && typeof product.externalUrl === 'string'
            && !Object.hasOwn(product, 'entitlementRequirement')
            && !Object.hasOwn(product, 'downloadsPath');
    }

    return product.releaseMapping === 'server-owned-private-blob'
        && typeof product.entitlementRequirement === 'string'
        && product.entitlementRequirement.length > 0;
}

export function listSoftwareProducts() {
    return SOFTWARE_PRODUCTS;
}

export function listPdfProducts() {
    return PDF_PRODUCTS;
}

export function listAffiliateRecommendations() {
    return AFFILIATE_RECOMMENDATIONS;
}

export function getMarketProduct(productId) {
    return [...SOFTWARE_PRODUCTS, ...PDF_PRODUCTS].find((product) => product.productId === productId) || null;
}

export function validateMarketCatalog() {
    return [...SOFTWARE_PRODUCTS, ...PDF_PRODUCTS, ...AFFILIATE_RECOMMENDATIONS]
        .every(validateMarketProduct);
}
