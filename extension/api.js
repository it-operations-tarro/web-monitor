/**
 * API communication and log queuing
 */

import { Storage } from './storage.js';

const API_ENDPOINT = 'http://messageboard-svr-dgt1-1.prod.letsdowonders.io:4448/logs'; 

export const Api = {
  /**
   * Attempts to send a log to the backend. If it fails, queues it locally.
   */
  async sendLog(logData) {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      console.log('Log sent successfully:', logData.domain);
      return true;
    } catch (error) {
      console.warn('API connection failed, queuing log locally:', error.message);
      await Storage.addToLogQueue(logData);
      return false;
    }
  },

  /**
   * Processes the local log queue and attempts to send pending items
   */
  async processQueue() {
    const queue = await Storage.getLogQueue();
    if (queue.length === 0) return;

    console.log(`Attempting to sync ${queue.length} queued logs...`);
    const remainingQueue = [];

    // Try to send each queued item
    for (const log of queue) {
      try {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log)
        });

        if (!response.ok) {
          remainingQueue.push(log);
        }
      } catch (e) {
        remainingQueue.push(log);
      }
    }

    // Update storage with items that still failed
    await Storage.clearLogQueue();
    if (remainingQueue.length > 0) {
      for (const item of remainingQueue) {
        await Storage.addToLogQueue(item);
      }
    }

    console.log(`Sync complete. Items remaining in queue: ${remainingQueue.length}`);
  },

  /**
   * Sends a minimal heartbeat to the server
   */
  async sendPing(pingData) {
    const PING_ENDPOINT = API_ENDPOINT.replace('/logs', '/ping');
    try {
      await fetch(PING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pingData)
      });
    } catch (e) {
      // Silent fail for pings
    }
  },

  /**
   * Fetches the global configuration from the server
   */
  async fetchConfig() {
    const CONFIG_ENDPOINT = API_ENDPOINT.replace('/logs', '/api/config');
    try {
      const response = await fetch(CONFIG_ENDPOINT);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error('Failed to fetch remote config:', e.message);
    }
    return null;
  }
};
