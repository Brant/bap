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

    // Create or update timer for this tab
    activeTimers[tabId] = {
      hostname,
      startTime: Date.now(),
      isActive: true
    };
  }

  // Stop tracking when tab becomes inactive
  if (msg.type === 'stop-tracking') {
    if (!sender || !sender.tab) return;
    
    const tabId = sender.tab.id;
    if (activeTimers[tabId] && activeTimers[tabId].isActive) {
      const timer = activeTimers[tabId];
      const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
      
      if (elapsed > 0) {
        storeTime(timer.hostname, elapsed);
      }
      
      // Mark as inactive
      timer.isActive = false;
    }
  }
  
  // Get tab session time (for content.js display)
  if (msg.type === 'get-tab-session-time') {
    if (!sender || !sender.tab) {
      sendResponse({ seconds: 0 });
      return true;
    }
    
    const tabId = sender.tab.id;
    const timer = activeTimers[tabId];
    
    if (timer && timer.isActive) {
      // For active timers, calculate current elapsed time
      const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
      sendResponse({ seconds: elapsed });
    } else {
      sendResponse({ seconds: 0 });
    }
    return true;
  }
  
  // Get latest data before displaying in popup
  if (msg.type === 'get-latest-data') {
    syncActiveTimers().then(() => {
      sendResponse({ updated: true });
    });
    return true; // Required for asynchronous response
  }
  
  // Get total site time for a specific hostname
  if (msg.type === 'get-site-total-time') {
    chrome.storage.local.get(['sites'], ({ sites = {} }) => {
      const hostname = msg.hostname;
      const today = new Date().toISOString().split('T')[0];
      
      const totalTime = sites[hostname]?.[today] || 0;
      sendResponse({ totalTime });
    });
    return true;
  }
});

// Handle tab close events
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTimers[tabId] && activeTimers[tabId].isActive) {
    const timer = activeTimers[tabId];
    const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
    
    if (elapsed > 0) {
      storeTime(timer.hostname, elapsed);
    }
    
    delete activeTimers[tabId];
  }
});

// Handle tab activation (switching between tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  
  // Pause all other active timers for the same hostname
  for (const id in activeTimers) {
    if (id != tabId && !activeTimers[id].paused) {
      const timer = activeTimers[id];
      const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
      
      if (elapsed > 0) {
        storeTime(timer.hostname, elapsed);
      }
      
      // Mark as paused
      timer.paused = true;
    }
  }
  
  // If this tab has a timer, make it the active one for its hostname
  if (activeTimers[tabId]) {
    const hostname = activeTimers[tabId].hostname;
    activeHostnames[hostname] = tabId;
    
    // If it was paused, resume it
    if (activeTimers[tabId].paused) {
      activeTimers[tabId].startTime = Date.now();
      activeTimers[tabId].paused = false;
    }
  }
});

// Sync all currently active timers to storage
async function syncActiveTimers() {
  const promises = [];
  const now = Date.now();
  
  for (const tabId in activeTimers) {
    const timer = activeTimers[tabId];
    if (timer && timer.isActive) {
      const elapsed = Math.floor((now - timer.startTime) / 1000);
      
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

// Store time in persistent storage
function storeTime(hostname, seconds, callback) {
  chrome.storage.local.get(['sites'], ({ sites = {} }) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Initialize data structure if needed
    if (!sites[hostname]) {
      sites[hostname] = {};
    }
    if (!sites[hostname][today]) {
      sites[hostname][today] = 0;
    }
    
    // Add the new time to the total
    sites[hostname][today] += seconds;
    
    // Store back to storage
    chrome.storage.local.set({ sites }, callback);
  });
}
