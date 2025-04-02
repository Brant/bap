// Single source of truth for timer state
const timerState = {
  activeTimers: new Map(), // Map of tabId -> timer info
  lastSyncTime: Date.now(),
  isSyncing: false,
  pageStates: new Map() // Map of tabId -> page state
};

// Page states
const PageState = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PAUSED: 'paused'
};

// Initial setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    sites: {}, 
    watchlist: [],
    lastSyncTimestamp: Date.now()
  });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'toggle-watchlist') {
    handleWatchlistToggle(msg.url, sendResponse);
    return true;
  }

  if (msg.type === 'start-tracking') {
    if (!sender?.tab?.id) return;
    handleStartTracking(sender.tab.id, msg.url);
    sendResponse({ status: 'tracking-started' });
  }

  if (msg.type === 'stop-tracking') {
    if (!sender?.tab?.id) return;
    handleStopTracking(sender.tab.id);
    sendResponse({ status: 'tracking-stopped' });
  }

  if (msg.type === 'sync-all-timers') {
    syncActiveTimers().then(() => {
      sendResponse({ status: 'synced' });
    });
    return true;
  }

  if (msg.type === 'get-latest-data') {
    syncActiveTimers().then(() => {
      sendResponse({ updated: true });
    });
    return true;
  }

  if (msg.type === 'get-timer-state') {
    if (!sender?.tab?.id) return;
    const timerInfo = timerState.activeTimers.get(sender.tab.id);
    sendResponse({ 
      status: 'success',
      timerInfo: timerInfo ? {
        elapsed: timerInfo.totalElapsed + (timerInfo.isActive ? calculateElapsedTime(timerInfo.startTime) : 0),
        isActive: timerInfo.isActive
      } : null
    });
    return true;
  }
});

// Handle watchlist toggling
async function handleWatchlistToggle(url, sendResponse) {
  const { watchlist = [] } = await chrome.storage.local.get(['watchlist']);
  const isInList = watchlist.includes(url);
  const updatedList = isInList
    ? watchlist.filter(site => site !== url)
    : [...watchlist, url];

  await chrome.storage.local.set({ watchlist: updatedList });
  sendResponse({ 
    status: 'updated', 
    watchlist: updatedList,
    isWatched: !isInList 
  });
}

// Handle starting tracking for a tab
function handleStartTracking(tabId, url) {
  const hostname = new URL(url).hostname;
  
  // Store any existing time for this tab
  if (timerState.activeTimers.has(tabId)) {
    const existingTimer = timerState.activeTimers.get(tabId);
    if (existingTimer.isActive && existingTimer.startTime) {
      const elapsed = calculateElapsedTime(existingTimer.startTime);
      existingTimer.totalElapsed += elapsed;
      storeTime(existingTimer.hostname, elapsed);
    }
  }

  // Create or update timer
  const existingTimer = timerState.activeTimers.get(tabId);
  timerState.activeTimers.set(tabId, {
    hostname,
    startTime: Date.now(),
    isActive: true,
    lastUpdateTime: Date.now(),
    totalElapsed: existingTimer?.totalElapsed || 0
  });

  timerState.pageStates.set(tabId, PageState.ACTIVE);
  ensureHostnameInStorage(hostname);
}

// Handle stopping tracking for a tab
function handleStopTracking(tabId) {
  const timer = timerState.activeTimers.get(tabId);
  if (timer?.isActive) {
    const elapsed = calculateElapsedTime(timer.startTime);
    if (elapsed > 0) {
      timer.totalElapsed += elapsed;
      storeTime(timer.hostname, elapsed);
    }
    
    timer.isActive = false;
    timer.startTime = null;
    timer.lastUpdateTime = Date.now();
  }
  
  timerState.pageStates.set(tabId, PageState.INACTIVE);
}

// Handle tab close events
chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = timerState.activeTimers.get(tabId);
  if (timer?.isActive) {
    const elapsed = calculateElapsedTime(timer.startTime);
    if (elapsed > 0) {
      timer.totalElapsed += elapsed;
      storeTime(timer.hostname, elapsed);
    }
  }
  
  timerState.activeTimers.delete(tabId);
  timerState.pageStates.delete(tabId);
});

// Handle tab switching
chrome.tabs.onActivated.addListener((activeInfo) => {
  const activeTabId = activeInfo.tabId;
  
  // Pause all other timers
  for (const [tabId, timer] of timerState.activeTimers.entries()) {
    if (tabId !== activeTabId && timer.isActive) {
      const elapsed = calculateElapsedTime(timer.startTime);
      if (elapsed > 0) {
        timer.totalElapsed += elapsed;
        storeTime(timer.hostname, elapsed);
      }
      
      timer.isActive = false;
      timer.startTime = null;
      timer.lastUpdateTime = Date.now();
      timerState.pageStates.set(tabId, PageState.PAUSED);
    }
  }
  
  // Update active tab state
  if (timerState.activeTimers.has(activeTabId)) {
    const timer = timerState.activeTimers.get(activeTabId);
    timer.isActive = true;
    timer.startTime = Date.now();
    timerState.pageStates.set(activeTabId, PageState.ACTIVE);
  }
});

// Calculate elapsed time with millisecond precision
function calculateElapsedTime(startTime) {
  if (!startTime) return 0;
  return (Date.now() - startTime) / 1000;
}

// Ensure hostname exists in storage
async function ensureHostnameInStorage(hostname) {
  const { sites = {} } = await chrome.storage.local.get(['sites']);
  const today = new Date().toISOString().split('T')[0];
  
  if (!sites[hostname]) {
    sites[hostname] = {};
  }
  if (sites[hostname][today] === undefined) {
    sites[hostname][today] = 0;
    await chrome.storage.local.set({ sites });
  }
}

// Store time in persistent storage
async function storeTime(hostname, seconds) {
  if (!hostname || seconds <= 0) return;
  
  const { sites = {} } = await chrome.storage.local.get(['sites']);
  const today = new Date().toISOString().split('T')[0];
  
  if (!sites[hostname]) {
    sites[hostname] = {};
  }
  if (sites[hostname][today] === undefined) {
    sites[hostname][today] = 0;
  }
  
  sites[hostname][today] += seconds;
  await chrome.storage.local.set({ sites });
}

// Sync all active timers to storage
async function syncActiveTimers() {
  if (timerState.isSyncing) return;
  timerState.isSyncing = true;
  
  try {
    const now = Date.now();
    const promises = [];
    
    for (const [tabId, timer] of timerState.activeTimers.entries()) {
      if (timer.isActive && timer.startTime) {
        const elapsed = calculateElapsedTime(timer.startTime);
        if (elapsed > 0) {
          timer.totalElapsed += elapsed;
          promises.push(storeTime(timer.hostname, elapsed));
          timer.startTime = now;
          timer.lastUpdateTime = now;
        }
      }
    }
    
    await Promise.all(promises);
    timerState.lastSyncTime = now;
  } finally {
    timerState.isSyncing = false;
  }
}

// Periodic sync to ensure data is saved regularly
setInterval(syncActiveTimers, 1000); // Sync every second

// Handle system wake/sleep events
chrome.runtime.onSuspend.addListener(() => {
  syncActiveTimers();
});
