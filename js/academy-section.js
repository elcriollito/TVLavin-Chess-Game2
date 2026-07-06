/**
 * CAISSA Academy Section
 *
 * Foundation-only shell for Season 5.0. This module registers Academy with
 * the existing navigation system and intentionally avoids engines, bots, LLMs,
 * networking, and training logic.
 */

const CaissaAcademySection = {
    elements: {},
    selections: {
        mentor: null,
        course: null,
        path: null
    },
    mentors: {
        academyMentorDaisy: { name: 'Daisy', title: 'Friendly Beginner' },
        academyMentorMya: { name: 'Mya', title: 'Club Coach' },
        academyMentorAlex: { name: 'Alex', title: 'Strategic Mentor' },
        academyMentorSophia: { name: 'Sophia', title: 'Advanced Club Mentor' },
        academyMentorMorphy: { name: 'Morphy', title: 'Attack Instructor' },
        academyMentorCapablanca: { name: 'Capablanca', title: 'Endgame Professor' },
        academyMentorTal: { name: 'Tal', title: 'Tactical Wizard' },
        academyMentorCaissa: { name: 'CAISSA', title: 'Adaptive Academy' }
    },
    courses: {
        academyCourse101: { name: 'Chess Fundamentals', id: 'Course 101', mentorId: 'academyMentorDaisy' },
        academyCourse102: { name: 'Opening Principles', id: 'Course 102', mentorId: 'academyMentorMya' },
        academyCourse201: { name: 'Pawn Structures', id: 'Course 201', mentorId: 'academyMentorAlex' },
        academyCourse202: { name: 'Planning in Chess', id: 'Course 202', mentorId: 'academyMentorSophia' },
        academyCourse301: { name: 'Attacking the King', id: 'Course 301', mentorId: 'academyMentorMorphy' },
        academyCourse302: { name: 'Initiative', id: 'Course 302', mentorId: 'academyMentorTal' },
        academyCourse401: { name: 'Fundamental Endgames', id: 'Course 401', mentorId: 'academyMentorCapablanca' },
        academyCourse402: { name: 'Technical Conversion', id: 'Course 402', mentorId: 'academyMentorCapablanca' },
        academyCourseA1: { name: 'Personalized Learning', id: 'Course A1', mentorId: 'academyMentorCaissa' }
    },
    pathRecommendations: {
        Openings: { facultyId: 'academyFacultyFundamentals', mentorId: 'academyMentorMya', courseId: 'academyCourse102' },
        Middlegame: { facultyId: 'academyFacultyStrategy', mentorId: 'academyMentorAlex', courseId: 'academyCourse201' },
        Endgames: { facultyId: 'academyFacultyEndgame', mentorId: 'academyMentorCapablanca', courseId: 'academyCourse401' },
        'Tactical Vision': { facultyId: 'academyFacultyDynamic', mentorId: 'academyMentorTal', courseId: 'academyCourse302' },
        'Positional Chess': { facultyId: 'academyFacultyStrategy', mentorId: 'academyMentorAlex', courseId: 'academyCourse201' },
        Calculation: { facultyId: 'academyFacultyStrategy', mentorId: 'academyMentorSophia', courseId: 'academyCourse202' },
        Defense: { facultyId: 'academyFacultyEndgame', mentorId: 'academyMentorCapablanca', courseId: 'academyCourse402' },
        'Attacking Chess': { facultyId: 'academyFacultyDynamic', mentorId: 'academyMentorMorphy', courseId: 'academyCourse301' },
        'Blitz Improvement': { facultyId: 'academyFacultyStrategy', mentorId: 'academyMentorSophia', courseId: 'academyCourse202' },
        'Classical Chess': { facultyId: 'academyFacultyEndgame', mentorId: 'academyMentorCapablanca', courseId: 'academyCourse402' },
        'Chess Fundamentals': { facultyId: 'academyFacultyFundamentals', mentorId: 'academyMentorDaisy', courseId: 'academyCourse101' },
        'Tournament Preparation': { facultyId: 'academyFacultyAdaptive', mentorId: 'academyMentorCaissa', courseId: 'academyCourseA1' }
    },

    init() {
        this.cacheElements();
        this.bindLearningPathFilters();
        this.prepareActiveInteractions();
        this.bindAuthUpdates();
        this.loadSelections();
        this.renderSelections();
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
            currentMentor: document.getElementById('academyCurrentMentor'),
            currentCourse: document.getElementById('academyCurrentCourse'),
            currentGoal: document.getElementById('academyCurrentGoal'),
            nextStepTitle: document.getElementById('academyNextStepTitle'),
            nextStepMessage: document.getElementById('academyNextStepMessage'),
            nextStepStatus: document.getElementById('academyNextStepStatus'),
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

    prepareActiveInteractions() {
        this.prepareMentorActions();
        this.prepareCourseActions();
        this.preparePathActions();
    },

    prepareMentorActions() {
        Object.entries(this.mentors).forEach(([mentorId, mentor]) => {
            const card = document.getElementById(mentorId);
            if (!card || card.dataset.academyInteractiveReady) return;
            card.dataset.academyInteractiveReady = 'true';

            const status = card.querySelector('.academy-faculty-status');
            if (status) status.textContent = 'Preview Active';

            const row = this.createActionRow();
            row.append(
                this.createActionButton('Choose Mentor', () => this.selectMentor(mentorId)),
                this.createActionButton('View Curriculum', () => this.openMentorCurriculum(card))
            );
            row.setAttribute('aria-label', `${mentor.name} active preview actions`);
            card.appendChild(row);

            card.querySelectorAll('.academy-profile-actions button').forEach((button) => {
                if (/open curriculum/i.test(button.textContent || '')) {
                    button.disabled = false;
                    button.classList.add('academy-action-live');
                    button.querySelector('span')?.replaceChildren(document.createTextNode('Preview Active'));
                    button.addEventListener('click', () => this.openMentorCurriculum(card));
                }
            });
        });
    },

    prepareCourseActions() {
        Object.entries(this.courses).forEach(([courseId, course]) => {
            const card = document.getElementById(courseId);
            if (!card || card.dataset.academyCourseReady) return;
            card.dataset.academyCourseReady = 'true';

            this.updateStatusInCard(card, 'Preview Active');
            const row = this.createActionRow();
            row.append(
                this.createActionButton('Select Course', () => this.selectCourse(courseId)),
                this.createActionButton('Course Details', () => this.openDetails(card, '.academy-course-details'))
            );
            row.setAttribute('aria-label', `${course.id} active preview actions`);
            card.appendChild(row);
        });
    },

    preparePathActions() {
        this.elements.pathCards.forEach((card) => {
            if (!card || card.dataset.academyPathReady) return;
            card.dataset.academyPathReady = 'true';

            const title = this.getCardTitle(card);
            const status = card.querySelector('.academy-path-status');
            if (status) status.textContent = 'Preview Active';

            const row = this.createActionRow();
            row.append(this.createActionButton('Select Learning Path', () => this.selectPath(title)));
            row.setAttribute('aria-label', `${title} active preview action`);
            card.appendChild(row);
        });
    },

    createActionRow() {
        const row = document.createElement('div');
        row.className = 'academy-active-actions';
        return row;
    },

    createActionButton(label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-active-button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    },

    selectMentor(mentorId) {
        this.selections.mentor = mentorId;
        this.persistSelections();
        this.renderSelections();
    },

    selectCourse(courseId) {
        this.selections.course = courseId;
        const course = this.courses[courseId];
        if (course?.mentorId && !this.selections.mentor) {
            this.selections.mentor = course.mentorId;
        }
        this.persistSelections();
        this.renderSelections();
    },

    selectPath(pathName) {
        if (!pathName) return;
        this.selections.path = pathName;
        const recommendation = this.pathRecommendations[pathName];
        if (recommendation) {
            this.selections.mentor = recommendation.mentorId;
            this.selections.course = recommendation.courseId;
        }
        this.persistSelections();
        this.renderSelections();
    },

    renderSelections() {
        this.clearSelectionHighlights();

        const mentor = this.mentors[this.selections.mentor];
        const course = this.courses[this.selections.course];
        const pathName = this.selections.path;
        const auth = window.CAISSA_AUTH || {};
        const signedIn = auth.isSignedIn === true;
        const guestNote = signedIn ? 'Your choices are saved locally on this device.' : 'Sign in to save this later.';

        if (this.elements.currentMentor) {
            this.elements.currentMentor.innerHTML = mentor
                ? `<a class="academy-inline-link" href="#${this.selections.mentor}">${this.escapeHtml(mentor.name)}</a>`
                : '<a class="academy-inline-link" href="#academyMentors">No mentor selected</a>';
        }

        if (this.elements.currentCourse) {
            this.elements.currentCourse.innerHTML = course
                ? `<a class="academy-inline-link" href="#${this.selections.course}">${this.escapeHtml(course.id)} - ${this.escapeHtml(course.name)}</a>`
                : '<a class="academy-inline-link" href="#academyCourses">None</a>';
        }

        this.setText(this.elements.currentGoal, pathName || 'Choose a learning path');

        if (mentor) {
            this.setText(this.elements.nextStepTitle, `Start with ${mentor.name}`);
            this.setText(this.elements.nextStepMessage, course
                ? `${course.id} - ${course.name}. ${guestNote}`
                : `${mentor.title}. ${guestNote}`);
        } else if (pathName) {
            this.setText(this.elements.nextStepTitle, `Explore ${pathName}`);
            this.setText(this.elements.nextStepMessage, guestNote);
        } else {
            this.setText(this.elements.nextStepTitle, 'Choose your first mentor');
            this.setText(this.elements.nextStepMessage, `Learning never ends. ${guestNote}`);
        }
        this.setText(this.elements.nextStepStatus, mentor || course || pathName ? 'Ready to Begin' : 'Preview Active');

        this.markSelected(this.selections.mentor);
        this.markSelected(this.selections.course);
        if (pathName) {
            this.elements.pathCards.forEach((card) => {
                if (this.getCardTitle(card) === pathName) card.classList.add('academy-selected');
            });
            const recommendation = this.pathRecommendations[pathName];
            this.markRecommended(recommendation?.facultyId);
            this.markRecommended(recommendation?.mentorId);
            this.markRecommended(recommendation?.courseId);
        }
    },

    clearSelectionHighlights() {
        document.querySelectorAll('.academy-selected, .academy-recommended').forEach((element) => {
            element.classList.remove('academy-selected', 'academy-recommended');
        });
    },

    markSelected(id) {
        if (!id) return;
        document.getElementById(id)?.classList.add('academy-selected');
    },

    markRecommended(id) {
        if (!id) return;
        document.getElementById(id)?.classList.add('academy-recommended');
    },

    openMentorCurriculum(card) {
        this.openDetails(card, '.academy-profile');
        card.querySelector('.academy-curriculum')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    openDetails(card, selector) {
        const details = card?.querySelector(selector);
        if (details) {
            details.open = true;
            details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    updateStatusInCard(card, value) {
        const statusRows = Array.from(card.querySelectorAll('dt')).filter((dt) => /status/i.test(dt.textContent || ''));
        statusRows.forEach((dt) => {
            const dd = dt.parentElement?.querySelector('dd');
            if (dd) dd.textContent = value;
        });
    },

    getCardTitle(card) {
        return (card?.querySelector('h4')?.textContent || '').trim();
    },

    getSelectionStorageKey() {
        const auth = window.CAISSA_AUTH || {};
        return auth.isSignedIn && auth.userId ? `caissa_academy_selection_${auth.userId}` : null;
    },

    loadSelections() {
        const key = this.getSelectionStorageKey();
        if (!key) return;
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '{}');
            this.selections = { ...this.selections, ...stored };
        } catch (error) {
            console.warn('CAISSA Academy: Could not load local selections', error);
        }
    },

    persistSelections() {
        const key = this.getSelectionStorageKey();
        if (!key) return;
        try {
            localStorage.setItem(key, JSON.stringify(this.selections));
        } catch (error) {
            console.warn('CAISSA Academy: Could not save local selections', error);
        }
    },

    bindAuthUpdates() {
        window.addEventListener('caissa-auth-change', () => {
            this.loadSelections();
            this.updateStudentIdentity();
            this.renderSelections();
        });
        window.setTimeout(() => {
            this.loadSelections();
            this.updateStudentIdentity();
            this.renderSelections();
        }, 250);
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

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
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
        this.renderSelections();
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
