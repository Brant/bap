let displayInterval;
let timerBox;
let isTracking = false;
let sessionSeconds = 0; // Track session time locally
let isWindowFocused = true; // Track browser window focus state
let lastTrackingTime = 0; // Last time tracking was active

const currentHostname = new URL(location.href).hostname;

// Add window focus/blur event listeners
window.addEventListener('focus', () => {
  isWindowFocused = true;
  // Resume tracking if document is visible and window is now focused
  if (document.visibilityState === 'visible' && timerBox && !isTracking) {
    startTracking();
  }
});

window.addEventListener('blur', () => {
  // Check if the blur event might be from opening our extension popup
  // We'll temporarily delay the pause to see if a focus event follows quickly
  setTimeout(() => {
    if (!isWindowFocused) return; // Already handled by a focus event
    
    isWindowFocused = false;
    pauseTracking();
  }, 300); // Short delay to catch quick focus/blur from popup
});

// Check if the current site is in the watchlist before creating the timer
chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
  if (watchlist.includes(currentHostname)) {
    createTimerDisplay();
    
    // Only start timer if document is visible AND window is focused
    if (document.visibilityState === 'visible' && isWindowFocused) {
      startTracking();
    } else {
      updateTimerDisplay();
    }
  }
});

// Monitor visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Only start tracking if the window is also focused
    if (timerBox && !isTracking && isWindowFocused) {
      startTracking();
    }
  } else {
    pauseTracking();
  }
});

// Start tracking time
function startTracking() {
  if (isTracking) return; // Prevent double-starts
  
  isTracking = true;
  lastTrackingTime = Date.now();
  
  // Send message to background script to start tracking
  chrome.runtime.sendMessage({ type: 'start-tracking', url: location.href });
  
  // Start display update interval
  startDisplayTimer();
}

// Pause tracking time (but don't reset)
function pauseTracking() {
  if (!isTracking) return;
  
  // Calculate time since last update and add to session
  if (lastTrackingTime > 0) {
    const elapsed = Math.floor((Date.now() - lastTrackingTime) / 1000);
    sessionSeconds += elapsed;
  }
  
  isTracking = false;
  clearInterval(displayInterval);
  displayInterval = null;
  lastTrackingTime = 0;
  
  // Tell background to stop tracking
  chrome.runtime.sendMessage({ type: 'stop-tracking', url: location.href });
  
  // Update display one last time before pausing
  updateTimerDisplay();
}

// Listen for watchlist changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.watchlist) {
    const newWatchlist = changes.watchlist.newValue || [];
    const isWatched = newWatchlist.includes(currentHostname);
    
    if (isWatched && !timerBox) {
      // Site was added to watchlist, create timer
      createTimerDisplay();
      
      // Only start tracking if document is visible AND window is focused
      if (document.visibilityState === 'visible' && isWindowFocused) {
        startTracking();
      } else {
        updateTimerDisplay();
      }
    } else if (!isWatched && timerBox) {
      // Site was removed from watchlist, remove timer
      pauseTracking();
      
      if (timerBox && timerBox.parentNode) {
        timerBox.parentNode.removeChild(timerBox);
        timerBox = null;
      }
      
      // Reset session time if removed from watchlist
      sessionSeconds = 0;
    }
  }
});

// Start timer display update
function startDisplayTimer() {
  if (displayInterval) {
    clearInterval(displayInterval);
  }
  
  // Initialize last tracking time if needed
  if (lastTrackingTime === 0) {
    lastTrackingTime = Date.now();
  }
  
  // Start the interval timer to update display
  displayInterval = setInterval(() => {
    if (isTracking) {
      // Calculate time since last update
      const currentElapsed = Math.floor((Date.now() - lastTrackingTime) / 1000);
      // Update display with session time + current elapsed time
      updateTimerDisplay(sessionSeconds + currentElapsed);
    }
  }, 1000);
}

// Update the timer display with session time
function updateTimerDisplay(timeToShow = sessionSeconds) {
  if (!timerBox) return;
  
  // Show the session time
  timerBox.innerHTML = `
    <span style="font-weight: 500; margin-right: 5px;">Just Be Aware:</span>
    <span>${formatTime(timeToShow)}</span>
  `;
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
    
    // Initial display with current session time
    updateTimerDisplay();
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
  pauseTracking();
});
