let watchlist = {};
let activeTimers = {};

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
  
  // Get latest data before displaying in popup
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
