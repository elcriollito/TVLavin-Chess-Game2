(function () {
    'use strict';

    const liveFree = [
        'Play, bots and local engine play',
        'Local analysis and game review',
        'Tactics, Academy and interactive diagrams',
        'Endgame Trainer, Practice and Library',
        'Opening Database, ECO and Polyglot tools',
        'FICS, PlayChess, Fritz and Spectator TV',
        'Local Game Library and Arena workflows'
    ];
    const creditBased = [
        'Shared CAISSA Mentor — account credits apply',
        'Variable-cost server AI and compute — credits apply'
    ];
    const comingSoon = [
        'Silver — Improve: higher service limits and guided workflows',
        'Gold — Understand: longitudinal insights and personalization',
        'Platinum — Master: advanced cloud automation and service levels',
        'Tier-specific cloud persistence, sync and entitlement enforcement'
    ];

    function list(items, icon) {
        return `<ul class="pricing-inventory-list">${items.map((item) => `<li><i class="fas ${icon}" aria-hidden="true"></i><span>${item}</span></li>`).join('')}</ul>`;
    }

    function render() {
        const billing = document.querySelector('.premium-billing-toggle');
        const comparison = document.getElementById('comparison');
        if (!comparison) return;
        billing?.remove();
        comparison.innerHTML = `
            <header class="pricing-inventory-heading">
                <p class="pricing-inventory-eyebrow">Current capability inventory</p>
                <h2>Free is a complete, durable membership state.</h2>
                <p>Free includes browser-local and public chess tools. Paid tiers inherit Free, but tier-specific benefits remain Coming Soon until enforcement and billing are certified.</p>
            </header>
            <div class="pricing-tier-map" aria-label="CAISSA membership hierarchy">
                <article><strong>Free</strong><span>Play &amp; Explore</span><em>Live</em></article>
                <article><strong>Silver</strong><span>Improve</span><em>Coming Soon</em></article>
                <article><strong>Gold</strong><span>Understand</span><em>Coming Soon</em></article>
                <article><strong>Platinum</strong><span>Master</span><em>Coming Soon</em></article>
            </div>
            <div class="pricing-inventory-grid">
                <section><h3><i class="fas fa-check-circle" aria-hidden="true"></i> Live Free</h3>${list(liveFree, 'fa-check')}</section>
                <section><h3><i class="fas fa-coins" aria-hidden="true"></i> Credit-Based</h3>${list(creditBased, 'fa-bolt')}<p class="pricing-inventory-note">Local review remains separate from Shared AI credits.</p></section>
                <section><h3><i class="fas fa-clock" aria-hidden="true"></i> Coming Soon</h3>${list(comingSoon, 'fa-clock')}</section>
            </div>
            <p class="pricing-inventory-boundary"><strong>Tier inheritance:</strong> Free ⊂ Silver ⊂ Gold ⊂ Platinum. No future capability on this page is represented as currently purchasable or enforced.</p>`;
        comparison.hidden = false;

        const primary = document.querySelector('.btn-primary-hero');
        if (primary) {
            primary.href = '/signup';
            primary.removeAttribute('class');
            primary.className = 'btn-primary-hero pricing-create-account';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
})();
