const i18n = window.CaissaI18n;
const expansionI18n = window.CaissaExpansionI18n;

localizePage();
i18n?.subscribe?.(localizePage);

function localizePage() {
    i18n?.apply?.(document);
    expansionI18n?.apply?.(document);
    const title = expansionI18n?.t?.('downloads.metaTitle', document.title) || document.title;
    const description = expansionI18n?.t?.(
        'downloads.metaDescription',
        document.querySelector('meta[name="description"]')?.content || ''
    );
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
}
