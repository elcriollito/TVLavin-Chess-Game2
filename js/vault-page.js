/**
 * CAISSA Vault - Data-driven download page
 * All items are configured via data arrays for easy maintenance
 */

// ============================================
// DATA CONFIGURATION
// ============================================

/**
 * Category cards shown at the top
 */
const categories = [
    {
        id: 'software',
        icon: 'fas fa-laptop-code',
        title: 'Portable Software',
        description: 'Standalone chess applications that run without installation. Perfect for USB drives and portable setups.',
        sectionId: 'software'
    },
    {
        id: 'pdfs',
        icon: 'fas fa-file-pdf',
        title: 'PDFs & Studies',
        description: 'Curated study guides, opening repertoires, and endgame references for all skill levels.',
        sectionId: 'pdfs'
    }
];

/**
 * Software/Portable Apps
 * Add new apps to this array - they'll automatically render
 */
const softwareItems = [
    {
        name: 'Polyglot Book Creator',
        version: 'v1.0.0',
        platform: 'Windows x64',
        icon: 'fas fa-book-open',
        description: 'Create and edit Polyglot opening books for chess engines. Supports PGN import and merge operations.',
        downloadUrl: '#',  // Replace with actual download link
        releaseNotesUrl: '#',  // Replace with actual release notes link
        sha256: 'a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1'  // Optional
    },
    {
        name: 'CAISSA Portable',
        version: 'v2.1.3',
        platform: 'Windows x64',
        icon: 'fas fa-chess-knight',
        description: 'Full CAISSA chess platform in a portable package. Includes Stockfish 16 and built-in opening book.',
        downloadUrl: '#',
        releaseNotesUrl: '#',
        sha256: null  // No SHA256 yet
    },
    {
        name: 'PGN Merger Tool',
        version: 'v0.5.2',
        platform: 'Cross-platform',
        icon: 'fas fa-code-merge',
        description: 'Merge multiple PGN files with deduplication. Supports filtering by player, date, and opening.',
        downloadUrl: '#',
        releaseNotesUrl: '#',
        sha256: 'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5'
    }
];

/**
 * PDF Study Materials
 * Add new PDFs to this array
 */
const pdfItems = [
    {
        title: 'Endgame Fundamentals Pack',
        version: 'v0.1',
        topic: 'Endgames',
        icon: 'fas fa-chess-rook',
        description: 'Essential endgame positions and techniques. Covers K+P, rook endgames, and basic checkmates.',
        downloadUrl: '#',  // Replace with actual PDF link
        previewUrl: '#'    // Replace with preview/sample link
    },
    {
        title: 'Sicilian Defense Repertoire',
        version: 'v1.2',
        topic: 'Openings',
        icon: 'fas fa-chess-pawn',
        description: 'Complete repertoire against the Sicilian Defense. Includes main lines and sidelines with detailed analysis.',
        downloadUrl: '#',
        previewUrl: '#'
    },
    {
        title: 'Tactical Pattern Recognition',
        version: 'v2.0',
        topic: 'Strategy',
        icon: 'fas fa-chess-queen',
        description: '500+ tactical puzzles organized by pattern. Includes pins, forks, skewers, and discovered attacks.',
        downloadUrl: '#',
        previewUrl: '#'
    },
    {
        title: 'London System Guide',
        version: 'v1.0',
        topic: 'Openings',
        icon: 'fas fa-chess-bishop',
        description: 'Modern London System repertoire for White. Covers all Black responses with model games.',
        downloadUrl: '#',
        previewUrl: '#'
    }
];

/**
 * Coming Soon items
 * These are displayed as a simple list without download links
 */
const comingSoonItems = [
    { name: 'CAISSA Opening Pack', type: 'PDF', icon: 'fas fa-book' },
    { name: 'CAISSA Engine Toolkit', type: 'Portable', icon: 'fas fa-toolbox' },
    { name: 'Cheat Detection Whitepaper', type: 'PDF', icon: 'fas fa-shield-halved' },
    { name: 'Advanced Middlegame Strategies', type: 'PDF', icon: 'fas fa-graduation-cap' },
    { name: 'Chess Database Manager', type: 'Portable', icon: 'fas fa-database' },
    { name: 'Elite Grandmaster Games Collection', type: 'PDF', icon: 'fas fa-trophy' }
];

// ============================================
// RENDERING FUNCTIONS
// ============================================

/**
 * Render category cards
 */
function renderCategories() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;

    grid.innerHTML = categories.map(cat => `
        <div class="vault-category-card" data-section="${cat.sectionId}">
            <div class="vault-category-icon">
                <i class="${cat.icon}"></i>
            </div>
            <h3>${cat.title}</h3>
            <p>${cat.description}</p>
            <button class="vault-category-btn" data-scroll-to="${cat.sectionId}">
                Browse
                <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `).join('');

    // Add click handlers for scrolling
    grid.querySelectorAll('[data-scroll-to]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-scroll-to');
            scrollToSection(targetId);
        });
    });

    // Make entire card clickable
    grid.querySelectorAll('.vault-category-card').forEach(card => {
        card.addEventListener('click', () => {
            const targetId = card.getAttribute('data-section');
            scrollToSection(targetId);
        });
    });
}

/**
 * Render software items
 */
function renderSoftware() {
    const grid = document.getElementById('softwareGrid');
    if (!grid) return;

    grid.innerHTML = softwareItems.map(item => `
        <div class="vault-item-card">
            <div class="vault-item-header">
                <div class="vault-item-icon">
                    <i class="${item.icon}"></i>
                </div>
                <div class="vault-item-title-group">
                    <h3 class="vault-item-title">${item.name}</h3>
                    <div class="vault-item-meta">
                        <span class="vault-item-badge version">
                            <i class="fas fa-tag"></i>
                            ${item.version}
                        </span>
                        <span class="vault-item-badge platform">
                            <i class="fas fa-desktop"></i>
                            ${item.platform}
                        </span>
                    </div>
                </div>
            </div>
            <p class="vault-item-description">${item.description}</p>
            <div class="vault-item-actions">
                <a href="${item.downloadUrl}" class="vault-item-btn vault-item-btn-primary">
                    <i class="fas fa-download"></i>
                    Download ZIP
                </a>
                <a href="${item.releaseNotesUrl}" class="vault-item-btn vault-item-btn-secondary">
                    <i class="fas fa-file-lines"></i>
                    Release Notes
                </a>
            </div>
            ${item.sha256 ? `
                <div class="vault-item-sha">
                    <span class="vault-item-sha-label">SHA256</span>
                    <code class="vault-item-sha-value">${item.sha256}</code>
                </div>
            ` : ''}
        </div>
    `).join('');
}

/**
 * Render PDF items
 */
function renderPDFs() {
    const grid = document.getElementById('pdfsGrid');
    if (!grid) return;

    grid.innerHTML = pdfItems.map(item => `
        <div class="vault-item-card">
            <div class="vault-item-header">
                <div class="vault-item-icon">
                    <i class="${item.icon}"></i>
                </div>
                <div class="vault-item-title-group">
                    <h3 class="vault-item-title">${item.title}</h3>
                    <div class="vault-item-meta">
                        <span class="vault-item-badge version">
                            <i class="fas fa-tag"></i>
                            ${item.version}
                        </span>
                        <span class="vault-item-badge format">
                            <i class="fas fa-file-pdf"></i>
                            PDF
                        </span>
                        <span class="vault-item-badge topic">
                            <i class="fas fa-bookmark"></i>
                            ${item.topic}
                        </span>
                    </div>
                </div>
            </div>
            <p class="vault-item-description">${item.description}</p>
            <div class="vault-item-actions">
                <a href="${item.downloadUrl}" class="vault-item-btn vault-item-btn-primary">
                    <i class="fas fa-download"></i>
                    Download PDF
                </a>
                <a href="${item.previewUrl}" class="vault-item-btn vault-item-btn-secondary">
                    <i class="fas fa-eye"></i>
                    Preview
                </a>
            </div>
        </div>
    `).join('');
}

/**
 * Render coming soon items
 */
function renderComingSoon() {
    const list = document.getElementById('comingSoonList');
    if (!list) return;

    list.innerHTML = comingSoonItems.map(item => `
        <li class="vault-coming-soon-item">
            <i class="${item.icon}"></i>
            <span>${item.name}</span>
            <span class="vault-item-badge">${item.type}</span>
        </li>
    `).join('');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Smooth scroll to a section
 */
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const headerOffset = 80; // Account for sticky header
    const elementPosition = section.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}

/**
 * Handle external link clicks (for analytics, etc.)
 */
function handleDownloadClick(event) {
    const link = event.target.closest('a');
    if (!link || link.getAttribute('href') === '#') {
        event.preventDefault();
        console.log('Download link not yet configured');
        return;
    }

    // Add analytics tracking here if needed
    console.log('Download initiated:', link.getAttribute('href'));
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the Vault page
 */
function init() {
    console.log('Initializing CAISSA Vault...');

    // Render all sections
    renderCategories();
    renderSoftware();
    renderPDFs();
    renderComingSoon();

    // Add download click tracking
    document.addEventListener('click', (e) => {
        if (e.target.closest('.vault-item-btn')) {
            handleDownloadClick(e);
        }
    });

    console.log('CAISSA Vault initialized successfully');
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for potential use in other modules
export { categories, softwareItems, pdfItems, comingSoonItems };
