let timerInterval;
let displayInterval;
let timerBox;
let isTracking = false;
const currentHostname = new URL(location.href).hostname;

// Check if the current site is in the watchlist before creating the timer
chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
  if (watchlist.includes(currentHostname)) {
    createTimerDisplay();
    
    // Only start timer if document is visible
    if (document.visibilityState === 'visible') {
      startTracking();
    } else {
      updateTimerDisplay(0);
    }
  }
});

// Monitor visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (timerBox && !isTracking) {
      startTracking();
    }
  } else {
    stopTracking();
  }
});

// Start tracking time
function startTracking() {
  if (isTracking) return; // Prevent double-starts
  
  isTracking = true;
  chrome.runtime.sendMessage({ type: 'start-tracking', url: location.href });
  
  // Start display update interval
  startDisplayTimer();
}

// Stop tracking time
function stopTracking() {
  if (!isTracking) return;
  
  isTracking = false;
  clearInterval(displayInterval);
  displayInterval = null;
  chrome.runtime.sendMessage({ type: 'stop-tracking', url: location.href });
}

// Listen for watchlist changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.watchlist) {
    const newWatchlist = changes.watchlist.newValue || [];
    const isWatched = newWatchlist.includes(currentHostname);
    
    if (isWatched && !timerBox) {
      // Site was added to watchlist, create timer
      createTimerDisplay();
      
      // Only start tracking if document is visible
      if (document.visibilityState === 'visible') {
        startTracking();
      } else {
        updateTimerDisplay(0);
      }
    } else if (!isWatched && timerBox) {
      // Site was removed from watchlist, remove timer
      stopTracking();
      
      if (timerBox && timerBox.parentNode) {
        timerBox.parentNode.removeChild(timerBox);
        timerBox = null;
      }
    }
  }
});

// Start timer display update
function startDisplayTimer() {
  if (displayInterval) {
    clearInterval(displayInterval);
  }
  
  // Update the display immediately
  updateTabTimer();
  
  // Set interval to update the display every second
  displayInterval = setInterval(updateTabTimer, 1000);
}

// Update timer from background script data
function updateTabTimer() {
  if (!isTracking || !timerBox) return;
  
  // Get the current tab session time from background
  chrome.runtime.sendMessage({ type: 'get-tab-session-time' }, (response) => {
    if (response && typeof response.seconds === 'number') {
      updateTimerDisplay(response.seconds);
    }
  });
}

// Update the timer display with seconds
function updateTimerDisplay(seconds) {
  if (!timerBox) return;
  
  // Get the site's total time for today
  chrome.runtime.sendMessage({ 
    type: 'get-site-total-time', 
    hostname: currentHostname 
  }, (response) => {
    const totalTime = (response && response.totalTime) || 0;
    
    // Format timer with session time / total time
    timerBox.innerHTML = `
      <span style="font-weight: 500; margin-right: 5px;">Just Be Aware:</span>
      <span title="Session time">${formatTime(seconds)}</span>
      <span style="margin: 0 5px;color: rgba(255,255,255,0.7);">|</span>
      <span title="Total today" style="color: rgba(255,255,255,0.7);">Total: ${formatTime(totalTime)}</span>
    `;
  });
}

function createTimerDisplay() {
  // Only create if it doesn't exist already
  if (!timerBox) {
    timerBox = document.createElement('div');
    timerBox.style.position = 'fixed';
    timerBox.style.top = '10px';
    timerBox.style.right = '10px';
    timerBox.style.zIndex = '10000';
    timerBox.style.background = 'rgba(0,0,0,0.8)';
    timerBox.style.color = '#fff';
    timerBox.style.padding = '8px 12px';
    timerBox.style.fontSize = '14px';
    timerBox.style.fontFamily = 'Roboto, Arial, sans-serif';
    timerBox.style.borderRadius = '4px';
    timerBox.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    timerBox.style.display = 'flex';
    timerBox.style.alignItems = 'center';
    document.body.appendChild(timerBox);
    
    // Initial display (0 seconds)
    updateTimerDisplay(0);
  }
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  } else {
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  stopTracking();
});
