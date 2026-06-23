/**
 * Business logic for domain matching and violation checks
 */

import { getDomainFromUrl } from './utils.js';

export const Rules = {
  _cache: {
    blacklist: null,
    exactSet: new Set(),
    wildcards: [],
    urlSet: new Set()
  },

  _prepareCache(blacklist) {
    if (this._cache.blacklist === blacklist) return;
    this._cache.blacklist = blacklist;
    this._cache.exactSet = new Set();
    this._cache.wildcards = [];
    this._cache.urlSet = new Set();

    blacklist.forEach(pattern => {
      const p = pattern.toLowerCase();
      if (p.startsWith('*.')) {
        this._cache.wildcards.push(p.slice(2));
      } else if (p.includes('/')) {
        // Path-specific entry — strip query/hash and trailing slash
        this._cache.urlSet.add(p.split('?')[0].split('#')[0].replace(/\/$/, ''));
      } else {
        this._cache.exactSet.add(p);
      }
    });
  },

  isBlacklisted(domain, blacklist, fullUrl = null) {
    if (!domain || !blacklist) return false;
    const d = domain.toLowerCase();
    this._prepareCache(blacklist);

    // 1. Domain exact match
    if (this._cache.exactSet.has(d)) return true;

    // 2. Wildcard match
    if (this._cache.wildcards.some(base => d === base || d.endsWith('.' + base))) return true;

    // 3. Path-specific match — only fires when a full URL is provided
    if (fullUrl && this._cache.urlSet.size > 0) {
      const norm = fullUrl.toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('?')[0].split('#')[0].replace(/\/$/, '');
      if (this._cache.urlSet.has(norm)) return true;
    }

    return false;
  },

  checkViolation(url, settings) {
    if (!settings.monitoringEnabled) return false;
    const domain = getDomainFromUrl(url);
    return this.isBlacklisted(domain, settings.blacklist, url);
  }
};
