/**
 * CAISSA Academy Section
 *
 * Foundation-only shell for Season 5.0. This module registers Academy with
 * the existing navigation system and intentionally avoids engines, bots, LLMs,
 * networking, and training logic.
 */

const CaissaAcademySection = {
    elements: {},

    init() {
        this.cacheElements();
        this.bindLearningPathFilters();
        this.bindAuthUpdates();
        this.updateStudentIdentity();
    },

    cacheElements() {
        this.elements = {
            section: document.getElementById('academySection'),
            title: document.getElementById('academyTitle'),
            identityBadge: document.getElementById('academyIdentityBadge'),
            passportAvatar: document.getElementById('academyPassportAvatar'),
            passportLabel: document.getElementById('academyPassportLabel'),
            studentName: document.getElementById('academyStudentName'),
            studentMessage: document.getElementById('academyStudentMessage'),
            passportStatus: document.getElementById('academyPassportStatus'),
            enrollmentDate: document.getElementById('academyEnrollmentDate'),
            journeyStatus: document.getElementById('academyJourneyStatus'),
            progressStats: Array.from(document.querySelectorAll('[data-academy-progress]')),
            pathFilters: Array.from(document.querySelectorAll('[data-academy-path-filter]')),
            pathCards: Array.from(document.querySelectorAll('[data-academy-path-difficulty]')),
            pathFilterNote: document.querySelector('[data-academy-path-filter-note]')
        };
    },

    bindLearningPathFilters() {
        if (!this.elements.pathFilters?.length || !this.elements.pathCards?.length) return;

        this.elements.pathFilters.forEach((filterButton) => {
            filterButton.addEventListener('click', () => {
                const filter = filterButton.dataset.academyPathFilter || 'all';
                this.applyLearningPathFilter(filter);
            });
        });
    },

    bindAuthUpdates() {
        window.addEventListener('caissa-auth-change', () => this.updateStudentIdentity());
        window.setTimeout(() => this.updateStudentIdentity(), 250);
    },

    updateStudentIdentity() {
        const auth = window.CAISSA_AUTH || {};
        const isSignedIn = auth.isSignedIn === true;
        const profile = this.getCurrentProfile(auth);
        const displayName = isSignedIn ? this.getStudentDisplayName(auth, profile) : 'Guest Student';
        const initials = this.getInitials(displayName, isSignedIn ? 'S' : 'G');
        const enrollmentDate = isSignedIn
            ? this.formatEnrollmentDate(profile?.createdAt)
            : 'Pending Enrollment';
        const statusText = isSignedIn
            ? 'Ready to Begin'
            : 'Sign in to track your progress.';
        const message = isSignedIn
            ? 'Your Academy journey is ready when lessons open.'
            : 'Sign in to personalize your Academy journey.';

        this.setText(this.elements.identityBadge, isSignedIn ? `Signed in as: ${displayName}` : 'Guest Mode');
        this.setText(this.elements.passportAvatar, initials);
        this.setText(this.elements.passportLabel, isSignedIn ? 'Student' : 'Guest Student');
        this.setText(this.elements.studentName, displayName);
        this.setText(this.elements.studentMessage, message);
        this.setText(this.elements.passportStatus, statusText);
        this.setText(this.elements.enrollmentDate, enrollmentDate);
        this.setText(this.elements.journeyStatus, statusText);

        this.elements.progressStats.forEach((stat) => {
            stat.textContent = isSignedIn ? '0' : '\u2014';
        });
    },

    getCurrentProfile(auth) {
        if (!auth?.isSignedIn || !auth.userId) return null;

        if (typeof auth.getUserProfile === 'function') {
            try {
                return auth.getUserProfile();
            } catch (error) {
                console.warn('CAISSA Academy: Could not read local user profile', error);
            }
        }

        try {
            const rawProfiles = localStorage.getItem('caissa_user_profile');
            if (!rawProfiles) return null;
            const profiles = JSON.parse(rawProfiles);
            return profiles?.[auth.userId] || null;
        } catch (error) {
            console.warn('CAISSA Academy: Could not parse local user profile', error);
            return null;
        }
    },

    getStudentDisplayName(auth, profile) {
        const clerkUser = window.Clerk?.user;
        const safeEmail = auth.email || profile?.email || clerkUser?.primaryEmailAddress?.emailAddress || '';
        const emailPrefix = safeEmail.includes('@') ? safeEmail.split('@')[0] : safeEmail;
        const candidates = [
            auth.fullName,
            profile?.fullName,
            clerkUser?.fullName,
            clerkUser?.firstName,
            clerkUser?.username,
            emailPrefix,
            'Registered Student'
        ];

        return candidates
            .map((value) => String(value || '').trim())
            .find((value) => value && value.toLowerCase() !== 'user') || 'Registered Student';
    },

    formatEnrollmentDate(value) {
        if (!value) return 'Pending Enrollment';

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Pending Enrollment';

        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    getInitials(name, fallback) {
        const parts = String(name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) return fallback;
        return parts
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('');
    },

    setText(element, value) {
        if (element) element.textContent = value;
    },

    applyLearningPathFilter(filter) {
        const normalizedFilter = filter || 'all';
        let visibleCount = 0;

        this.elements.pathFilters.forEach((button) => {
            const isActive = button.dataset.academyPathFilter === normalizedFilter;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        this.elements.pathCards.forEach((card) => {
            const matches = normalizedFilter === 'all' || card.dataset.academyPathDifficulty === normalizedFilter;
            card.hidden = !matches;
            if (matches) visibleCount += 1;
        });

        if (this.elements.pathFilterNote) {
            const label = normalizedFilter === 'all'
                ? 'all learning paths'
                : `${normalizedFilter} learning paths`;
            this.elements.pathFilterNote.textContent = `Showing ${visibleCount} ${label}. Filters are active in this beta; lessons still remain Coming Soon.`;
        }
    },

    onEnter() {
        this.elements.section?.setAttribute('data-academy-state', 'ready');
        this.updateStudentIdentity();
    },

    onExit() {
        this.elements.section?.removeAttribute('data-academy-state');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CaissaAcademySection.init());
} else {
    CaissaAcademySection.init();
}

if (window.CaissaNavigation) {
    window.CaissaNavigation.registerSection('academy', CaissaAcademySection);
}

window.CaissaAcademySection = CaissaAcademySection;
