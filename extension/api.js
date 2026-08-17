/**
 * API communication and log queuing
 */

import { Storage } from './storage.js';

// Fargate service behind its own internal load balancer. Served at ROOT (the
// /webmon prefix belonged to the old shared nginx proxy on the ITAM server).
// /ping and /api/config are derived from this by replacing the /logs suffix.
const API_ENDPOINT = 'http://internal-itops-webmon-alb-1401027685.ap-southeast-1.elb.amazonaws.com/logs';

export const Api = {
  /**
   * Attempts to send a log to the backend. If it fails, queues it locally.
   */
  async sendLog(logData) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      console.log('Log sent successfully:', logData.domain);
      return true;
    } catch (error) {
      clearTimeout(timeout);
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          remainingQueue.push(log);
        }
      } catch (e) {
        clearTimeout(timeout);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(PING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pingData),
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (e) {
      clearTimeout(timeout);
    }
  },

  /**
   * Fetches the global configuration from the server
   */
  async fetchConfig() {
    const CONFIG_ENDPOINT = API_ENDPOINT.replace('/logs', '/api/config');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(CONFIG_ENDPOINT, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      clearTimeout(timeout);
      console.error('Failed to fetch remote config:', e.message);
    }
    return null;
  }
};
