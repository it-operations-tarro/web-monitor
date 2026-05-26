/**
 * Utility functions for Agent Browser Monitor
 */

/**
 * Extracts the domain from a URL string, stripping protocols, paths, and query parameters.
 * @param {string} urlString 
 * @returns {string|null}
 */
export function getDomainFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Ignore about:, chrome:, etc.
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

/**
 * Simple debounce function to prevent duplicate execution
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Validates if a URL is sensitive (chrome, file, etc.)
 */
export function isSensitiveUrl(url) {
  return url.startsWith('chrome://') || 
         url.startsWith('file://') || 
         url.startsWith('about:') || 
         url.startsWith('chrome-extension://');
}
