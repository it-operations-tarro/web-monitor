import { Storage } from './storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const lockScreen = document.getElementById('lockScreen');
  const settingsContainer = document.getElementById('settingsContainer');
  const unlockPass = document.getElementById('unlockPass');
  const unlockBtn = document.getElementById('unlockBtn');
  const passError = document.getElementById('passError');
  
  const monitoringToggle = document.getElementById('monitoringToggle');
  const machineIdInput = document.getElementById('machineId');
  const usernameInput = document.getElementById('username');
  const violationActionSelect = document.getElementById('violationAction');
  const newAdminPassInput = document.getElementById('newAdminPass');
  const saveBtn = document.getElementById('saveBtn');
  const lockBtn = document.getElementById('lockBtn');
  const statusLabel = document.getElementById('statusLabel');
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');

  // Load effective settings (including Managed IT values)
  let settings = await Storage.getSettings();
  
  // Update status immediately (even on lock screen)
  updateStatusLabel(settings.monitoringEnabled);

  // Handle Unlock
  unlockBtn.addEventListener('click', () => {
    if (unlockPass.value === settings.adminPassword) {
      showSettings();
    } else {
      passError.style.display = 'block';
      setTimeout(() => { passError.style.display = 'none'; }, 2000);
    }
  });

  unlockPass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') unlockBtn.click();
  });

  function showSettings() {
    lockScreen.style.display = 'none';
    settingsContainer.style.display = 'block';
    
    // Populate form
    monitoringToggle.checked = settings.monitoringEnabled;
    machineIdInput.value = settings.machineId || '';
    usernameInput.value = settings.username || '';
    violationActionSelect.value = settings.violationAction || 'redirect';
    
    // Handle Managed Machine ID (Disable input if IT policy is active)
    if (settings.isManaged) {
      machineIdInput.readOnly = true;
      machineIdInput.style.opacity = '0.6';
      machineIdInput.title = 'Controlled by IT Policy (Managed)';
      const label = machineIdInput.previousElementSibling;
      if (label) label.textContent += ' (Managed by IT)';
    }

    updateStatusLabel(settings.monitoringEnabled);
  }

  // Handle Save
  saveBtn.addEventListener('click', async () => {
    const updated = {
      monitoringEnabled: monitoringToggle.checked,
      machineId: machineIdInput.value.trim() || 'AGENT-GENERIC',
      violationAction: violationActionSelect.value
    };

    if (newAdminPassInput.value.trim()) {
      updated.adminPassword = newAdminPassInput.value.trim();
    }

    await chrome.storage.local.set(updated);
    window.location.reload();
  });

  // Handle Force Sync
  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    syncBtn.disabled = true;
    
    chrome.runtime.sendMessage({ action: 'forceSync' }, async (response) => {
      if (response && response.success) {
        syncStatus.style.display = 'block';
        syncBtn.textContent = 'Force Config Sync Now';
        syncBtn.disabled = false;
        
        // Refresh local settings after sync
        settings = await Storage.getSettings();
        setTimeout(() => { syncStatus.style.display = 'none'; }, 3000);
      } else {
        syncBtn.textContent = 'Sync Failed';
        syncBtn.disabled = false;
        setTimeout(() => { syncBtn.textContent = 'Force Config Sync Now'; }, 3000);
      }
    });
  });

  lockBtn.addEventListener('click', () => {
    window.location.reload();
  });

  function updateStatusLabel(isEnabled) {
    statusLabel.textContent = isEnabled ? 'Active' : 'Paused';
    statusLabel.className = `status-badge ${isEnabled ? 'on' : 'off'}`;
  }
});
