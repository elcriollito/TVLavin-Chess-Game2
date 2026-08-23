(function () {
    'use strict';

    const PLAYER_ALBUMS = Object.freeze([
    {"id":"smallchess-adolf-anderssen","title":"Adolf Anderssen","file":"Adolf Anderssen.pgn"},
    {"id":"smallchess-alexander-alekhine","title":"Alexander Alekhine","file":"Alexander Alekhine.pgn"},
    {"id":"smallchess-alexander-grischuk","title":"Alexander Grischuk","file":"Alexander Grischuk.pgn"},
    {"id":"smallchess-alexander-morozevich","title":"Alexander Morozevich","file":"Alexander Morozevich.pgn"},
    {"id":"smallchess-alexandra-kosteniuk","title":"Alexandra Kosteniuk","file":"Alexandra Kosteniuk.pgn"},
    {"id":"smallchess-alexey-shirov","title":"Alexey Shirov","file":"Alexey Shirov.pgn"},
    {"id":"smallchess-alireza-firouzja","title":"Alireza Firouzja","file":"Alireza Firouzja.pgn"},
    {"id":"smallchess-anatoly-karpov","title":"Anatoly Karpov","file":"Anatoly Karpov.pgn"},
    {"id":"smallchess-anish-giri","title":"Anish Giri","file":"Anish Giri.pgn"},
    {"id":"smallchess-arjun-erigaisi","title":"Arjun Erigaisi","file":"Arjun Erigaisi.pgn"},
    {"id":"smallchess-bobby-fischer","title":"Bobby Fischer","file":"Bobby Fischer.pgn"},
    {"id":"smallchess-boris-gelfand","title":"Boris Gelfand","file":"Boris Gelfand.pgn"},
    {"id":"smallchess-boris-spassky","title":"Boris Spassky","file":"Boris Spassky.pgn"},
    {"id":"smallchess-daniil-dubov","title":"Daniil Dubov","file":"Daniil Dubov.pgn"},
    {"id":"smallchess-david-janowski","title":"David Janowski","file":"David Janowski.pgn"},
    {"id":"smallchess-ding-liren","title":"Ding Liren","file":"Ding Liren.pgn"},
    {"id":"smallchess-dommaraju-gukesh","title":"Dommaraju Gukesh","file":"Dommaraju Gukesh.pgn"},
    {"id":"smallchess-emanuel-lasker","title":"Emanuel Lasker","file":"Emanuel Lasker.pgn"},
    {"id":"smallchess-fabiano-caruana","title":"Fabiano Caruana","file":"Fabiano Caruana.pgn"},
    {"id":"smallchess-frank-marshall","title":"Frank Marshall","file":"Frank Marshall.pgn"},
    {"id":"smallchess-garry-kasparov","title":"Garry Kasparov","file":"Garry Kasparov.pgn"},
    {"id":"smallchess-gata-kamsky","title":"Gata Kamsky","file":"Gata Kamsky.pgn"},
    {"id":"smallchess-hans-niemann","title":"Hans Niemann","file":"Hans Niemann.pgn"},
    {"id":"smallchess-hikaru-nakamura","title":"Hikaru Nakamura","file":"Hikaru Nakamura.pgn"},
    {"id":"smallchess-hou-yifan","title":"Hou Yifan","file":"Hou Yifan.pgn"},
    {"id":"smallchess-ian-nepomniachtchi","title":"Ian Nepomniachtchi","file":"Ian Nepomniachtchi.pgn"},
    {"id":"smallchess-jan-krzysztof-duda","title":"Jan-Krzysztof Duda","file":"Jan-Krzysztof Duda.pgn"},
    {"id":"smallchess-johannes-zukertort","title":"Johannes Zukertort","file":"Johannes Zukertort.pgn"},
    {"id":"smallchess-ju-wenjun","title":"Ju Wenjun","file":"Ju Wenjun.pgn"},
    {"id":"smallchess-judit-polgar","title":"Judit Polgar","file":"Judit Polgar.pgn"},
    {"id":"smallchess-levon-aronian","title":"Levon Aronian","file":"Levon Aronian.pgn"},
    {"id":"smallchess-loek-van-wely","title":"Loek van Wely","file":"Loek van Wely.pgn"},
    {"id":"smallchess-magnus-carlsen","title":"Magnus Carlsen","file":"Magnus Carlsen.pgn"},
    {"id":"smallchess-max-euwe","title":"Max Euwe","file":"Max Euwe.pgn"},
    {"id":"smallchess-maxime-vachier-lagrave","title":"Maxime Vachier-Lagrave","file":"Maxime Vachier-Lagrave.pgn"},
    {"id":"smallchess-michael-adams","title":"Michael Adams","file":"Michael Adams.pgn"},
    {"id":"smallchess-mikhail-botvinnik","title":"Mikhail Botvinnik","file":"Mikhail Botvinnik.pgn"},
    {"id":"smallchess-mikhail-tal","title":"Mikhail Tal","file":"Mikhail Tal.pgn"},
    {"id":"smallchess-nigel-short","title":"Nigel Short","file":"Nigel Short.pgn"},
    {"id":"smallchess-nodirbek-abdusattorov","title":"Nodirbek Abdusattorov","file":"Nodirbek Abdusattorov.pgn"},
    {"id":"smallchess-paul-keres","title":"Paul Keres","file":"Paul Keres.pgn"},
    {"id":"smallchess-paul-morphy","title":"Paul Morphy","file":"Paul Morphy.pgn"},
    {"id":"smallchess-peter-leko","title":"Peter Leko","file":"Peter Leko.pgn"},
    {"id":"smallchess-peter-svidler","title":"Peter Svidler","file":"Peter Svidler.pgn"},
    {"id":"smallchess-rameshbabu-praggnanandhaa","title":"Rameshbabu Praggnanandhaa","file":"Rameshbabu Praggnanandhaa.pgn"},
    {"id":"smallchess-richard-rapport","title":"Richard Rapport","file":"Richard Rapport.pgn"},
    {"id":"smallchess-samuel-reshevsky","title":"Samuel Reshevsky","file":"Samuel Reshevsky.pgn"},
    {"id":"smallchess-samuel-shankland","title":"Samuel Shankland","file":"Samuel Shankland.pgn"},
    {"id":"smallchess-sergey-karjakin","title":"Sergey Karjakin","file":"Sergey Karjakin.pgn"},
    {"id":"smallchess-shakhriyar-mamedyarov","title":"Shakhriyar Mamedyarov","file":"Shakhriyar Mamedyarov.pgn"},
    {"id":"smallchess-siegbert-tarrasch","title":"Siegbert Tarrasch","file":"Siegbert Tarrasch.pgn"},
    {"id":"smallchess-teimour-radjabov","title":"Teimour Radjabov","file":"Teimour Radjabov.pgn"},
    {"id":"smallchess-tigran-petrosian","title":"Tigran Petrosian","file":"Tigran Petrosian.pgn"},
    {"id":"smallchess-vasily-smyslov","title":"Vasily Smyslov","file":"Vasily Smyslov.pgn"},
    {"id":"smallchess-vassily-ivanchuk","title":"Vassily Ivanchuk","file":"Vassily Ivanchuk.pgn"},
    {"id":"smallchess-veselin-topalov","title":"Veselin Topalov","file":"Veselin Topalov.pgn"},
    {"id":"smallchess-viktor-korchnoi","title":"Viktor Korchnoi","file":"Viktor Korchnoi.pgn"},
    {"id":"smallchess-vincent-keymer","title":"Vincent Keymer","file":"Vincent Keymer.pgn"},
    {"id":"smallchess-viswanathan-anand","title":"Viswanathan Anand","file":"Viswanathan Anand.pgn"},
    {"id":"smallchess-vladimir-kramnik","title":"Vladimir Kramnik","file":"Vladimir Kramnik.pgn"},
    {"id":"smallchess-wang-hao","title":"Wang Hao","file":"Wang Hao.pgn"},
    {"id":"smallchess-wei-yi","title":"Wei Yi","file":"Wei Yi.pgn"},
    {"id":"smallchess-wesley-so","title":"Wesley So","file":"Wesley So.pgn"},
    {"id":"smallchess-wilhelm-steinitz","title":"Wilhelm Steinitz","file":"Wilhelm Steinitz.pgn"},
    {"id":"smallchess-yu-yangyi","title":"Yu Yangyi","file":"Yu Yangyi.pgn"}
]);
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const fileInput = document.querySelector('[data-pgn-file]');
    const iconography = window.CaissaPgnPlayerIconography;
    if (!albumRoot || !fileInput || !iconography) return;

    let selectedAlbumId = null;
    let syntheticImport = false;
    let renderQueued = false;

    function createAlbumCard(album) {
        const item = document.createElement('div');
        item.setAttribute('role', 'listitem');
        item.dataset.externalAlbumItem = album.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card';
        card.dataset.catalogAlbumId = album.id;
        card.setAttribute('aria-current', String(album.id === selectedAlbumId));
        const icon = document.createElement('i');
        iconography.decorate(icon, card, album.title);
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = album.title;
        const details = document.createElement('small');
        details.textContent = 'Player game collection · PGN';
        copy.append(title, details);
        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = 'free';
        badge.textContent = 'Free';
        card.append(icon, copy, badge);
        item.append(card);
        return item;
    }

    function renderCatalog() {
        renderQueued = false;
        const existingTitles = new Set([...albumRoot.querySelectorAll('.pgn-album-card strong')].map(node => node.textContent.trim().toLocaleLowerCase()));
        for (const album of PLAYER_ALBUMS) {
            if (existingTitles.has(album.title.toLocaleLowerCase())) continue;
            albumRoot.append(createAlbumCard(album));
        }
        if (selectedAlbumId) {
            albumRoot.querySelectorAll('[data-catalog-album-id]').forEach(card => card.setAttribute('aria-current', String(card.dataset.catalogAlbumId === selectedAlbumId)));
            albumRoot.querySelector('[data-album-id="local-import"]')?.closest('[role="listitem"]')?.remove();
        }
    }

    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        queueMicrotask(renderCatalog);
    }

    new MutationObserver(queueRender).observe(albumRoot, { childList: true });

    albumRoot.addEventListener('click', async event => {
        const card = event.target.closest('[data-catalog-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const album = PLAYER_ALBUMS.find(item => item.id === card.dataset.catalogAlbumId);
        if (!album) return;
        selectedAlbumId = album.id;
        renderCatalog();
        card.disabled = true;
        try {
            if (!window.CaissaPgnEntitlements) throw new Error('Protected album access is unavailable.');
            const bytes = await window.CaissaPgnEntitlements.fetchAlbum(album);
            if (!bytes) { selectedAlbumId = null; renderCatalog(); return; }
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], album.file, { type: 'application/x-chess-pgn' }));
            syntheticImport = true;
            try {
                fileInput.files = transfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            } finally {
                syntheticImport = false;
            }
        } catch (error) {
            selectedAlbumId = null;
            renderCatalog();
            const message = document.querySelector('[data-pgn-message]');
            if (message) {
                message.textContent = error?.message || 'The collection could not be opened.';
                message.dataset.tone = 'error';
                message.hidden = false;
            }
        } finally {
            card.disabled = false;
        }
    }, true);

    fileInput.addEventListener('change', () => {
        if (!syntheticImport) {
            selectedAlbumId = null;
            queueRender();
        }
    }, true);

    renderCatalog();
})();
