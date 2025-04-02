let watchlist = {};
let activeTimers = {};
let activeHostnames = {}; // Track which hostnames are currently being tracked

// Initial setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sites: {}, watchlist: [] });
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'toggle-watchlist') {
    chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
      const isInList = watchlist.includes(msg.url);
      const updatedList = isInList
        ? watchlist.filter(site => site !== msg.url)
        : [...watchlist, msg.url];

      chrome.storage.local.set({ watchlist: updatedList }, () => {
        sendResponse({ 
          status: 'updated', 
          watchlist: updatedList,
          isWatched: !isInList 
        });
      });
    });
    return true;
  }

  // Start tracking a new tab or update an existing one
  if (msg.type === 'start-tracking') {
    if (!sender || !sender.tab) return;
    
    const tabId = sender.tab.id;
    const hostname = new URL(msg.url).hostname;

    // If we already had a timer for this tab, store any time that might have accumulated
    if (activeTimers[tabId]) {
      if (activeTimers[tabId].isActive && activeTimers[tabId].startTime) {
        const elapsed = calculateElapsedTime(activeTimers[tabId].startTime);
        if (elapsed > 0) {
          storeTime(activeTimers[tabId].hostname, elapsed);
        }
      }
    }

    // Create or update timer for this tab
    activeTimers[tabId] = {
      hostname,
      startTime: Date.now(),
      isActive: true
    };
    
    // Ensure this hostname is stored in sites even if there's no time yet
    ensureHostnameInStorage(hostname);
    
    sendResponse({ status: 'tracking-started' });
  }

  // Stop tracking when tab becomes inactive
  if (msg.type === 'stop-tracking') {
    if (!sender || !sender.tab) return;
    
    const tabId = sender.tab.id;
    if (activeTimers[tabId] && activeTimers[tabId].isActive) {
      const timer = activeTimers[tabId];
      const elapsed = calculateElapsedTime(timer.startTime);
      
      if (elapsed > 0) {
        storeTime(timer.hostname, elapsed);
      }
      
      // Mark as inactive and clear start time
      timer.isActive = false;
      timer.startTime = null;
      
      sendResponse({ status: 'tracking-stopped' });
    }
  }
  
  // Special message just to force sync all active timers (used by popup)
  if (msg.type === 'sync-all-timers') {
    syncActiveTimers().then(() => {
      sendResponse({ status: 'synced' });
    });
    return true;
  }
  
  // Get latest data before displaying in popup
  if (msg.type === 'get-latest-data') {
    syncActiveTimers().then(() => {
      sendResponse({ updated: true });
    });
    return true;
  }
});

// Ensure a hostname exists in storage
function ensureHostnameInStorage(hostname) {
  chrome.storage.local.get(['sites'], ({ sites = {} }) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Initialize data structure if needed
    if (!sites[hostname]) {
      sites[hostname] = {};
    }
    if (sites[hostname][today] === undefined) {
      sites[hostname][today] = 0;
      chrome.storage.local.set({ sites });
    }
  });
}

// Handle tab close events
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTimers[tabId] && activeTimers[tabId].isActive) {
    const timer = activeTimers[tabId];
    const elapsed = calculateElapsedTime(timer.startTime);
    
    if (elapsed > 0) {
      storeTime(timer.hostname, elapsed);
    }
    
    delete activeTimers[tabId];
  }
});

// Handle tab switching (activated)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  
  // Pause all other timers 
  for (const id in activeTimers) {
    if (id != tabId && activeTimers[id].isActive) {
      const timer = activeTimers[id];
      const elapsed = calculateElapsedTime(timer.startTime);
      
      if (elapsed > 0) {
        storeTime(timer.hostname, elapsed);
      }
      
      // Mark as paused
      timer.isActive = false;
      timer.startTime = null;
    }
  }
});

// Calculate elapsed time in seconds with millisecond precision
function calculateElapsedTime(startTime) {
  if (!startTime) return 0;
  const elapsedMs = Date.now() - startTime;
  return elapsedMs / 1000; // Return seconds with decimal precision
}

// Sync all currently active timers to storage
async function syncActiveTimers() {
  const promises = [];
  const now = Date.now();
  
  for (const tabId in activeTimers) {
    const timer = activeTimers[tabId];
    if (timer && timer.isActive && timer.startTime) {
      const elapsed = calculateElapsedTime(timer.startTime);
      
      if (elapsed > 0) {
        // Store the current elapsed time
        promises.push(new Promise(resolve => {
          storeTime(timer.hostname, elapsed, resolve);
        }));
        
        // Reset the start time to now
        timer.startTime = now;
      }
    }
  }
  
  return Promise.all(promises);
}

// Store time in persistent storage with improved precision
function storeTime(hostname, seconds, callback) {
  if (!hostname || seconds <= 0) {
    if (callback) callback();
    return;
  }
  
  chrome.storage.local.get(['sites'], ({ sites = {} }) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Initialize data structure if needed
    if (!sites[hostname]) {
      sites[hostname] = {};
    }
    if (sites[hostname][today] === undefined) {
      sites[hostname][today] = 0;
    }
    
    // Add the new time to the total
    sites[hostname][today] += seconds;
    
    // Store back to storage
    chrome.storage.local.set({ sites }, callback);
  });
}

// Add periodic sync to ensure data is saved regularly
setInterval(syncActiveTimers, 5000); // Sync every 5 seconds
