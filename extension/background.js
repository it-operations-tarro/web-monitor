/**
 * Agent Browser Monitor - Background Service Worker
 */

import { Storage } from './storage.js';
import { Rules } from './rules.js';
import { Api } from './api.js';
import { getDomainFromUrl, isSensitiveUrl } from './utils.js';

// Bandwidth tracking
let currentBandwidthBytes = 0;

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const contentLengthHeader = details.responseHeaders?.find(
      (h) => h.name.toLowerCase() === 'content-length'
    );
    if (contentLengthHeader && contentLengthHeader.value) {
      const bytes = parseInt(contentLengthHeader.value, 10);
      if (!isNaN(bytes)) {
        currentBandwidthBytes += bytes;
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Initialize storage and capture identity on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  await Storage.init();
  await captureIdentity();
  chrome.alarms.create('syncLogs', { periodInMinutes: 5 });
  chrome.alarms.create('checkIdentity', { periodInMinutes: 60 });
  chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  chrome.alarms.create('syncConfig', { periodInMinutes: 30 });
  await syncConfig();
});

chrome.runtime.onStartup.addListener(async () => {
  await captureIdentity();
  await syncConfig();
});

// Alarm listeners
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncLogs') {
    Api.processQueue();
  } else if (alarm.name === 'checkIdentity') {
    captureIdentity();
  } else if (alarm.name === 'heartbeat') {
    sendHeartbeat();
  } else if (alarm.name === 'syncConfig') {
    syncConfig();
  }
});

// Message listener for force sync from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'forceSync') {
    syncConfig().then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async
  }
});

async function syncConfig() {
  console.log('Syncing global config from server...');
  const remoteConfig = await Api.fetchConfig();
  if (remoteConfig) {
    const localSettings = await Storage.getSettings();
    const updatedSettings = {
      ...localSettings,
      blacklist: remoteConfig.blacklist || localSettings.blacklist,
      monitoringEnabled: remoteConfig.monitoringEnabled !== undefined ? remoteConfig.monitoringEnabled : localSettings.monitoringEnabled,
      violationAction: remoteConfig.violationAction || localSettings.violationAction
    };
    await Storage.setSettings(updatedSettings);
    console.log('Global config updated successfully');
  }
}

async function sendHeartbeat() {
  const settings = await Storage.getSettings();
  
  // Capture and reset bandwidth tracker
  const bandwidthToSend = currentBandwidthBytes;
  currentBandwidthBytes = 0;

  await Api.sendPing({
    machine_id: settings.machineId,
    username: settings.username,
    timestamp: new Date().toISOString(),
    bandwidth: bandwidthToSend
  });
}

/**
 * Capture's the logged-in Chrome profile email
 */
async function captureIdentity() {
  try {
    const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    if (userInfo && userInfo.email) {
      console.log('Identity captured:', userInfo.email);
      await chrome.storage.local.set({ username: userInfo.email });
    } else {
      console.warn('User not signed in to Chrome. Using manual/guest identification.');
    }
  } catch (error) {
    console.error('Error capturing identity:', error);
  }
}

/**
 * Handle completed navigations
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const url = details.url;
  if (isSensitiveUrl(url)) return;

  const settings = await Storage.getSettings();
  const domain = getDomainFromUrl(url);
  const isViolation = Rules.checkViolation(url, settings);

  const logPayload = {
    machine_id: settings.machineId,
    username: settings.username, // Will be email if captured, or manual entry
    domain: domain,
    full_url: url,
    timestamp: new Date().toISOString(),
    violation: isViolation
  };

  await Api.sendLog(logPayload);

  if (isViolation) {
    handleViolation(details.tabId, settings.violationAction, domain);
  }
});

async function handleViolation(tabId, action, domain) {
  // Only set badge to indicate monitoring of violation
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId });

  if (action === 'alert') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Activity Logged',
      message: `Your visit to ${domain} has been logged for administrative review.`,
      priority: 1
    });
  }
}
