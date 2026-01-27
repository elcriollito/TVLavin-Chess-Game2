/**
 * CAISSA Library Page - JavaScript
 *
 * Handles loading posts from JSON, filtering by tags, and rendering cards.
 */

const LibraryPage = {
    // State
    posts: [],
    allTags: [],
    activeTag: 'all',

    // DOM elements
    elements: {},

    /**
     * Initialize the library page
     */
    async init() {
        this.cacheElements();
        this.bindModalEvents();
        await this.loadPosts();
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            tagFilters: document.getElementById('tagFilters'),
            postsGrid: document.getElementById('postsGrid'),
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            errorState: document.getElementById('errorState'),
            // Modal elements
            addPostBtn: document.getElementById('addPostBtn'),
            addPostModal: document.getElementById('addPostModal'),
            closeAddPostModal: document.getElementById('closeAddPostModal')
        };
    },

    /**
     * Bind modal open/close events
     */
    bindModalEvents() {
        const { addPostBtn, addPostModal, closeAddPostModal } = this.elements;

        // Open modal
        if (addPostBtn) {
            addPostBtn.addEventListener('click', () => this.openModal());
        }

        // Close via X button
        if (addPostModal) {
            const closeBtn = addPostModal.querySelector('.library-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal());
            }
        }

        // Close via "Got it" button
        if (closeAddPostModal) {
            closeAddPostModal.addEventListener('click', () => this.closeModal());
        }

        // Close via backdrop click
        if (addPostModal) {
            const backdrop = addPostModal.querySelector('.library-modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeModal());
            }
        }

        // Close via Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });
    },

    /**
     * Open the Add Post modal
     */
    openModal() {
        const { addPostModal } = this.elements;
        if (!addPostModal) return;

        addPostModal.classList.add('open');
        document.body.classList.add('modal-open');

        // Focus the close button for accessibility
        const closeBtn = addPostModal.querySelector('.library-modal-close');
        if (closeBtn) closeBtn.focus();
    },

    /**
     * Close the Add Post modal
     */
    closeModal() {
        const { addPostModal, addPostBtn } = this.elements;
        if (!addPostModal) return;

        addPostModal.classList.remove('open');
        document.body.classList.remove('modal-open');

        // Return focus to the trigger button
        if (addPostBtn) addPostBtn.focus();
    },

    /**
     * Check if modal is currently open
     */
    isModalOpen() {
        const { addPostModal } = this.elements;
        return addPostModal && addPostModal.classList.contains('open');
    },

    /**
     * Load posts from JSON file
     */
    async loadPosts() {
        this.showLoading();

        try {
            const response = await fetch('/data/blogPosts.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.posts = await response.json();

            // Extract all unique tags
            this.extractTags();

            // Sort posts: featured first, then by date descending
            this.sortPosts();

            // Render UI
            this.renderTagFilters();
            this.renderPosts();

            this.hideLoading();
        } catch (error) {
            console.error('LibraryPage: Failed to load posts', error);
            this.showError();
        }
    },

    /**
     * Extract all unique tags from posts
     */
    extractTags() {
        const tagSet = new Set();
        this.posts.forEach(post => {
            (post.tags || []).forEach(tag => tagSet.add(tag));
        });
        this.allTags = Array.from(tagSet).sort();
    },

    /**
     * Sort posts: featured first, then by date descending
     */
    sortPosts() {
        this.posts.sort((a, b) => {
            // Featured posts first
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;

            // Then by date descending
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
        });
    },

    /**
     * Render tag filter chips
     */
    renderTagFilters() {
        const container = this.elements.tagFilters;
        if (!container) return;

        // Count posts per tag
        const tagCounts = {};
        this.allTags.forEach(tag => {
            tagCounts[tag] = this.posts.filter(p => (p.tags || []).includes(tag)).length;
        });

        let html = `
            <button class="library-filter-chip ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">
                All <span class="chip-count">(${this.posts.length})</span>
            </button>
        `;

        this.allTags.forEach(tag => {
            const isActive = this.activeTag === tag;
            html += `
                <button class="library-filter-chip ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
                    ${this.escapeHtml(tag)} <span class="chip-count">(${tagCounts[tag]})</span>
                </button>
            `;
        });

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll('.library-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.activeTag = chip.dataset.tag;
                this.renderTagFilters();
                this.renderPosts();
            });
        });
    },

    /**
     * Render post cards
     */
    renderPosts() {
        const container = this.elements.postsGrid;
        if (!container) return;

        // Filter posts by active tag
        let filtered = this.posts;
        if (this.activeTag !== 'all') {
            filtered = this.posts.filter(p => (p.tags || []).includes(this.activeTag));
        }

        if (filtered.length === 0) {
            container.innerHTML = '';
            this.showEmpty();
            return;
        }

        this.hideEmpty();

        container.innerHTML = filtered.map(post => this.renderPostCard(post)).join('');
    },

    /**
     * Render a single post card
     */
    renderPostCard(post) {
        const langBadge = post.lang
            ? `<span class="library-badge library-badge-lang ${post.lang}">${post.lang.toUpperCase()}</span>`
            : '';

        const featuredBadge = post.featured
            ? `<span class="library-badge library-badge-featured"><i class="fas fa-star"></i>Featured</span>`
            : '';

        const tagsHtml = (post.tags || []).slice(0, 4).map(tag =>
            `<span class="library-post-tag">${this.escapeHtml(tag)}</span>`
        ).join('');

        const dateDisplay = this.formatDate(post.date);

        return `
            <article class="library-post-card ${post.featured ? 'featured' : ''}">
                <div class="library-post-header">
                    <div class="library-post-badges">
                        ${langBadge}
                        ${featuredBadge}
                    </div>
                </div>
                <h2 class="library-post-title">${this.escapeHtml(post.title)}</h2>
                <p class="library-post-snippet">${this.escapeHtml(post.snippet)}</p>
                <div class="library-post-tags">${tagsHtml}</div>
                <div class="library-post-footer">
                    <span class="library-post-date">${dateDisplay}</span>
                    <a href="${this.escapeHtml(post.url)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="library-post-read-btn">
                        Read <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </article>
        `;
    },

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // State management
    showLoading() {
        if (this.elements.loadingState) this.elements.loadingState.style.display = 'flex';
        if (this.elements.emptyState) this.elements.emptyState.style.display = 'none';
        if (this.elements.errorState) this.elements.errorState.style.display = 'none';
        if (this.elements.postsGrid) this.elements.postsGrid.style.display = 'none';
    },

    hideLoading() {
        if (this.elements.loadingState) this.elements.loadingState.style.display = 'none';
        if (this.elements.postsGrid) this.elements.postsGrid.style.display = 'grid';
    },

    showEmpty() {
        if (this.elements.emptyState) this.elements.emptyState.style.display = 'flex';
    },

    hideEmpty() {
        if (this.elements.emptyState) this.elements.emptyState.style.display = 'none';
    },

    showError() {
        if (this.elements.loadingState) this.elements.loadingState.style.display = 'none';
        if (this.elements.errorState) this.elements.errorState.style.display = 'flex';
        if (this.elements.postsGrid) this.elements.postsGrid.style.display = 'none';
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    LibraryPage.init();
});
