(function () {
    'use strict';

    function normalizeName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('en')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function nameSet(names) {
        return new Set(names.map(normalizeName));
    }

    const OPEN_WORLD_CHAMPIONS = nameSet([
        'Alexander Alekhine',
        'Alexander Khalifman',
        'Anatoly Karpov',
        'Bobby Fischer',
        'Boris Spassky',
        'Ding Liren',
        'Dommaraju Gukesh',
        'Emanuel Lasker',
        'Garry Kasparov',
        'José Raúl Capablanca',
        'Magnus Carlsen',
        'Max Euwe',
        'Mikhail Botvinnik',
        'Mikhail Tal',
        'Ruslan Ponomariov',
        'Rustam Kasimdzhanov',
        'Tigran Petrosian',
        'Vasily Smyslov',
        'Veselin Topalov',
        'Viswanathan Anand',
        'Vladimir Kramnik',
        'Wilhelm Steinitz'
    ]);

    const WOMENS_WORLD_CHAMPIONS = nameSet([
        'Alexandra Kosteniuk',
        'Antoaneta Stefanova',
        'Hou Yifan',
        'Ju Wenjun',
        'Maia Chiburdanidze',
        'Nona Gaprindashvili',
        'Susan (Zsuzsa) Polgar',
        'Xie Jun'
    ]);

    const WORLD_CHAMPIONSHIP_MATCH_CHALLENGERS = nameSet([
        'Alexey Shirov',
        'Boris Gelfand',
        'David Bronstein',
        'David Janowski',
        'Fabiano Caruana',
        'Frank Marshall',
        'Gata Kamsky',
        'Ian Nepomniachtchi',
        'Johannes Zukertort',
        'Michael Adams',
        'Nigel Short',
        'Peter Leko',
        'Sergey Karjakin',
        'Siegbert Tarrasch',
        'Vassily Ivanchuk',
        'Viktor Korchnoi'
    ]);

    const PROFILES = Object.freeze({
        'open-world-champion': Object.freeze({ status: 'open-world-champion', iconClass: 'fas fa-chess-king', label: 'World chess champion' }),
        'womens-world-champion': Object.freeze({ status: 'womens-world-champion', iconClass: 'fas fa-chess-queen', label: "Women's world chess champion" }),
        'world-championship-challenger': Object.freeze({ status: 'world-championship-challenger', iconClass: 'fas fa-chess-rook', label: 'World championship match challenger' }),
        player: Object.freeze({ status: 'player', iconClass: 'fas fa-chess-knight', label: 'Chess player' })
    });

    function describe(name) {
        const normalized = normalizeName(name);
        if (OPEN_WORLD_CHAMPIONS.has(normalized)) return PROFILES['open-world-champion'];
        if (WOMENS_WORLD_CHAMPIONS.has(normalized)) return PROFILES['womens-world-champion'];
        if (WORLD_CHAMPIONSHIP_MATCH_CHALLENGERS.has(normalized)) return PROFILES['world-championship-challenger'];
        return PROFILES.player;
    }

    function decorate(icon, card, name) {
        const profile = describe(name);
        icon.className = profile.iconClass;
        icon.setAttribute('aria-label', profile.label);
        icon.title = profile.label;
        card.dataset.playerDistinction = profile.status;
        return profile;
    }

    window.CaissaPgnPlayerIconography = Object.freeze({ decorate, describe, normalizeName });
})();
