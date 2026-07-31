export const RESPONSIVE_GEOMETRY_TOLERANCE_PX = 2;
export const RESPONSIVE_BOARD_ASPECT_TOLERANCE_PX = 2;

export function validateTolerance(value) {
    if (!Number.isFinite(value) || value < 0 || value > 4)
        throw new RangeError('Responsive geometry tolerance must be between 0 and 4 CSS pixels.');
    return value;
}

export function rectHasSize(rect) {
    return !!rect && rect.width > 0 && rect.height > 0;
}

export function rectWithinViewport(rect, viewport, tolerance = RESPONSIVE_GEOMETRY_TOLERANCE_PX) {
    validateTolerance(tolerance);
    return rectHasSize(rect)
        && rect.left >= -tolerance
        && rect.right <= viewport.width + tolerance;
}

export function rectWithinParent(rect, parent, tolerance = RESPONSIVE_GEOMETRY_TOLERANCE_PX) {
    validateTolerance(tolerance);
    return rectHasSize(rect) && rectHasSize(parent)
        && rect.left >= parent.left - tolerance
        && rect.right <= parent.right + tolerance;
}

export function isSquare(rect, tolerance = RESPONSIVE_BOARD_ASPECT_TOLERANCE_PX) {
    validateTolerance(tolerance);
    return rectHasSize(rect) && Math.abs(rect.width - rect.height) <= tolerance;
}

export async function collectResponsiveGeometry(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const box = node.getBoundingClientRect();
            return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const visible = selector => {
            const node = document.querySelector(selector);
            if (!node) return false;
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
        };
        const context = document.querySelector('.caissa-simplified-shell__context');
        const footer = document.querySelector('.caissa-simplified-shell__footer');
        const primary = document.querySelector('[data-games-primary], .caissa-post-game__action--primary');
        const board = rect('#playSection #chessboard');
        const rail = rect('#playSection #evalBar');
        const modes = rect('.caissa-simplified-shell__modes');
        const clocks = [...document.querySelectorAll('#topClockWhite,#topClockBlack')]
            .filter(node => node.getBoundingClientRect().width > 0);
        const headers = [...document.querySelectorAll('.caissa-simplified-shell__player')]
            .filter(node => node.getBoundingClientRect().width > 0);
        const scrollOwners = [...document.querySelectorAll('.caissa-simplified-shell *')]
            .filter(node => {
                const style = getComputedStyle(node);
                return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
            }).map(node => node.className || node.id);
        return {
            viewport: { width: innerWidth, height: innerHeight },
            board, rail, modes, context: rect('.caissa-simplified-shell__context'),
            footer: rect('.caissa-simplified-shell__footer'),
            primary: rect('[data-games-primary], .caissa-post-game__action--primary'),
            boardBeforeModes: !!board && !!modes && board.top < modes.top,
            railOverlapsBoard: !!board && !!rail && !(rail.right <= board.left || rail.left >= board.right || rail.bottom <= board.top || rail.top >= board.bottom),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clocks: clocks.length, headers: headers.length,
            tabsVisible: visible('.caissa-simplified-shell__modes'),
            panelVisible: visible('.caissa-simplified-shell__context'),
            primaryVisible: visible('[data-games-primary], .caissa-post-game__action--primary'),
            contextScrollable: !!context && context.scrollHeight > context.clientHeight + 2,
            footerCoversFocus: !!footer && visible('.caissa-simplified-shell__footer') && !!primary
                && !!document.activeElement && footer !== document.activeElement
                && (() => {
                    const focus = document.activeElement.getBoundingClientRect();
                    const fixed = ['fixed', 'sticky'].includes(getComputedStyle(footer).position);
                    return fixed && focus.bottom > footer.getBoundingClientRect().top;
                })(),
            nestedScrollOwners: scrollOwners,
            shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot()
        };
    });
}
