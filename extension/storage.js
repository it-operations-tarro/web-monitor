/**
 * Storage management for Agent Browser Monitor
 */

const DEFAULT_CONFIG = {
  monitoringEnabled: true,
  machineId: 'AGENT-GENERIC',
  username: 'unknown_agent',
  blacklist: [
    'facebook.com',
    '*.facebook.com',
    'youtube.com',
    '*.youtube.com',
    'twitter.com',
    '*.twitter.com'
  ],
  violationAction: 'monitor',
  logQueue: [],
  adminPassword: 'admin123'
};

export const Storage = {
  async init() {
    const data = await chrome.storage.local.get(null);
    if (Object.keys(data).length === 0) {
      await chrome.storage.local.set(DEFAULT_CONFIG);
    }
  },

  /**
   * Gets effective settings, prioritizing "Managed" IT policy values
   */
  async getSettings() {
    // 1. Get local user settings
    const local = await chrome.storage.local.get([
      'monitoringEnabled',
      'machineId',
      'username',
      'blacklist',
      'violationAction',
      'adminPassword'
    ]);

    // 2. Get managed (Enterprise Policy) settings
    const managed = await new Promise((resolve) => {
      chrome.storage.managed.get(['machineId', 'blacklist', 'violationAction'], (data) => {
        resolve(data || {});
      });
    });

    // 3. Merge: Managed IT Policy values override local user settings
    return {
      ...local,
      machineId: managed.machineId || local.machineId,
      blacklist: managed.blacklist || local.blacklist,
      violationAction: managed.violationAction || local.violationAction,
      isManaged: !!managed.machineId // Flag to show "Policy Managed" in UI
    };
  },

  async setSettings(settings) {
    await chrome.storage.local.set(settings);
  },

  async getLogQueue() {
    const data = await chrome.storage.local.get('logQueue');
    return data.logQueue || [];
  },

  async addToLogQueue(log) {
    const queue = await this.getLogQueue();
    queue.push(log);
    if (queue.length > 1000) queue.shift();
    await chrome.storage.local.set({ logQueue: queue });
  },

  async clearLogQueue() {
    await chrome.storage.local.set({ logQueue: [] });
  }
};
