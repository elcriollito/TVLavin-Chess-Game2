// Vercel Web Analytics
// This script initializes Vercel Web Analytics for the CAISSA Chess application
// https://vercel.com/docs/analytics

(function() {
  'use strict';
  
  // Only run analytics in production (Vercel deployment)
  const isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.port === '8000';
  
  if (isDevelopment) {
    console.log('[Vercel Analytics] Skipped in development mode');
    return;
  }

  // Initialize Vercel Analytics using the queue API
  // This allows analytics to start collecting data before the main script loads
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // Load the Vercel Analytics script
  const script = document.createElement('script');
  script.src = 'https://va.vercel-scripts.com/v1/script.js';
  script.defer = true;
  script.setAttribute('data-mode', 'production');
  
  // Add error handling
  script.onerror = function() {
    console.warn('[Vercel Analytics] Failed to load analytics script');
  };
  
  // Append script to document
  if (document.head) {
    document.head.appendChild(script);
  } else {
    // Fallback if head is not yet available
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(script);
    });
  }
})();
