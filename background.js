let watchlist = {};
let activeTimers = {};

// Simple function to update the extension icon based on color scheme
function updateIcon(isDarkMode) {
  const iconPath = isDarkMode ? "icons/icon-darkmode.png" : "icons/icon-lightmode.png";
  chrome.action.setIcon({ path: iconPath });
}

// Function to check dark mode using system color scheme
function checkDarkMode() {
  if (self.matchMedia) {
    return self.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

// Initial setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sites: {}, watchlist: [] });
  // Default icon
  updateIcon(false);
});

// Detect theme using content script that has access to window.matchMedia
function detectThemeFromContent() {
  // Create a content script that will check the theme and report back
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length === 0) return;
    
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: () => {
        const isDarkMode = window.matchMedia && 
                          window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDarkMode;
      }
    }, (results) => {
      if (chrome.runtime.lastError || !results || results.length === 0) {
        // Default to light mode if we can't detect
        updateIcon(false);
        return;
      }
      
      const isDarkMode = results[0].result;
      updateIcon(isDarkMode);
      
      // Store the theme preference
      chrome.storage.local.set({ isDarkMode });
    });
  });
}

// Listen for theme changes from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'theme-changed') {
    updateIcon(msg.isDarkMode);
    sendResponse({ status: 'updated' });
    return true;
  }
  
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

  if (msg.type === 'start-tracking') {
    const tabId = sender.tab.id;
    const hostname = new URL(msg.url).hostname;

    if (!activeTimers[tabId]) {
      activeTimers[tabId] = { hostname, start: Date.now() };
    }
  }

  if (msg.type === 'stop-tracking') {
    const tabId = sender.tab.id;
    const timer = activeTimers[tabId];
    if (timer) {
      const elapsed = Math.floor((Date.now() - timer.start) / 1000);
      storeTime(timer.hostname, elapsed);
      delete activeTimers[tabId];
    }
  }
  
  // New message type to get latest data before displaying in popup
  if (msg.type === 'get-latest-data') {
    // Sync all active timers to storage before responding
    syncActiveTimers().then(() => {
      sendResponse({ updated: true });
    });
    return true; // Required for asynchronous response
  }
  
  // Force sync current site tracking data
  if (msg.type === 'sync-tracking-data') {
    syncActiveTimers();
    return true;
  }
});

// Sync all currently active timers to storage
async function syncActiveTimers() {
  const promises = [];
  
  // For each active timer, calculate current elapsed time and store it
  for (const tabId in activeTimers) {
    const timer = activeTimers[tabId];
    if (timer) {
      const now = Date.now();
      const elapsed = Math.floor((now - timer.start) / 1000);
      
      // Only update if we have meaningful time (more than 1 second)
      if (elapsed > 0) {
        // Store the time and update the timer start time
        promises.push(new Promise(resolve => {
          storeTime(timer.hostname, elapsed, resolve);
        }));
        
        // Reset the start time to now
        timer.start = now;
      }
    }
  }
  
  // Wait for all storage operations to complete
  return Promise.all(promises);
}

function storeTime(hostname, seconds, callback) {
  chrome.storage.local.get(['sites'], ({ sites = {} }) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // e.g., 2025-04-02

    if (!sites[hostname]) sites[hostname] = {};
    if (!sites[hostname][today]) sites[hostname][today] = 0;

    sites[hostname][today] += seconds;

    chrome.storage.local.set({ sites }, callback);
  });
}
