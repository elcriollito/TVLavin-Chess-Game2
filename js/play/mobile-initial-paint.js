(function markInitialMobileCoachPaint(root, document) {
    'use strict';
    const viewport = root.visualViewport;
    const width = Math.min(root.innerWidth || viewport?.width || 0, viewport?.width || root.innerWidth || 0);
    const height = Math.min(root.innerHeight || viewport?.height || 0, viewport?.height || root.innerHeight || 0);
    const phone = width > 0 && height > 0 && (width <= 600 || (width > height && width <= 932));
    const coach = /^\/play(?:\/beta)?\/coach\/?$/i.test(root.location?.pathname || '');
    document.documentElement.classList.toggle('caissa-initial-phone-coach', phone && coach);
})(window, document);
