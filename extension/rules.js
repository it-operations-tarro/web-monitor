/**
 * Business logic for domain matching and violation checks
 */

import { getDomainFromUrl } from './utils.js';

export const Rules = {
  // Cache for the fast lookup set
  _cache: {
    blacklist: null,
    exactSet: new Set(),
    wildcards: []
  },

  /**
   * Internal helper to build lookup cache
   */
  _prepareCache(blacklist) {
    if (this._cache.blacklist === blacklist) return;
    
    this._cache.blacklist = blacklist;
    this._cache.exactSet = new Set();
    this._cache.wildcards = [];

    blacklist.forEach(pattern => {
      const p = pattern.toLowerCase();
      if (p.startsWith('*.')) {
        this._cache.wildcards.push(p.slice(2));
      } else {
        this._cache.exactSet.add(p);
      }
    });
  },

  /**
   * Matches a domain against the blacklist using O(1) Set lookup
   */
  isBlacklisted(domain, blacklist) {
    if (!domain || !blacklist) return false;
    const d = domain.toLowerCase();

    // 1. Prepare/refresh cache
    this._prepareCache(blacklist);
    
    // 2. O(1) Instant Check (99.9% of cases)
    if (this._cache.exactSet.has(d)) return true;

    // 3. O(N) Wildcard Check (Only for the few manually added wildcards)
    return this._cache.wildcards.some(base => d === base || d.endsWith('.' + base));
  },

  /**
   * Evaluates if a URL navigation should be blocked
   */
  checkViolation(url, settings) {
    if (!settings.monitoringEnabled) return false;
    const domain = getDomainFromUrl(url);
    return this.isBlacklisted(domain, settings.blacklist);
  }
};
