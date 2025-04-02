let displayInterval;
let timerBox;
let isDisplaying = false;
let lastUpdateTime = 0;
let currentElapsed = 0;
let isWindowFocused = true;
let blurTimeout = null;
let isExtensionValid = true;

const currentHostname = new URL(location.href).hostname;

// Handle extension context invalidation
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (chrome.runtime.lastError) {
    isExtensionValid = false;
    stopDisplay();
    if (timerBox) {
      timerBox.remove();
      timerBox = null;
    }
    return;
  }
  return true;
});

// Handle window focus/blur events
window.addEventListener('focus', () => {
  if (!isExtensionValid) return;
  
  isWindowFocused = true;
  if (document.visibilityState === 'visible') {
    startDisplay();
    chrome.runtime.sendMessage({ 
      type: 'start-tracking', 
      url: location.href 
    }).catch(() => {
      isExtensionValid = false;
      stopDisplay();
    });
  }
});

window.addEventListener('blur', () => {
  if (!isExtensionValid) return;

  // Clear any existing timeout
  if (blurTimeout) {
    clearTimeout(blurTimeout);
  }

  // Set isWindowFocused to false immediately
  isWindowFocused = false;

  // Set a short timeout to check if this blur was from the extension popup
  blurTimeout = setTimeout(() => {
    // If we're still blurred after the timeout, it's a real blur event
    if (!isWindowFocused) {
      stopDisplay();
      chrome.runtime.sendMessage({ 
        type: 'stop-tracking', 
        url: location.href 
      }).catch(() => {
        isExtensionValid = false;
        stopDisplay();
      });
    }
  }, 100); // 100ms should be enough to catch quick focus/blur from popup
});

// Initialize display and start tracking if site is in watchlist
chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
  if (!isExtensionValid) return;
  
  if (watchlist.includes(currentHostname)) {
    createTimerDisplay();
    // Only start if both window and document are visible
    if (document.visibilityState === 'visible' && isWindowFocused) {
      startDisplay();
      chrome.runtime.sendMessage({ 
        type: 'start-tracking', 
        url: location.href 
      }).catch(() => {
        isExtensionValid = false;
        stopDisplay();
      });
    } else {
      updateTimerDisplay();
    }
  }
});

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (!isExtensionValid) return;
  
  if (document.visibilityState === 'visible' && isWindowFocused) {
    startDisplay();
    chrome.runtime.sendMessage({ 
      type: 'start-tracking', 
      url: location.href 
    }).catch(() => {
      isExtensionValid = false;
      stopDisplay();
    });
  } else {
    stopDisplay();
    chrome.runtime.sendMessage({ 
      type: 'stop-tracking', 
      url: location.href 
    }).catch(() => {
      isExtensionValid = false;
      stopDisplay();
    });
  }
});

// Start display updates
function startDisplay() {
  if (isDisplaying || !isExtensionValid) return;
  
  isDisplaying = true;
  lastUpdateTime = Date.now();
  
  // Get initial state from background
  chrome.runtime.sendMessage({ type: 'get-timer-state' }, (response) => {
    if (chrome.runtime.lastError) {
      isExtensionValid = false;
      stopDisplay();
      return;
    }
    
    if (response?.status === 'success' && response.timerInfo) {
      currentElapsed = response.timerInfo.elapsed;
      updateTimerDisplay();
    }
  });
  
  // Start display update interval
  startDisplayTimer();
}

// Stop display updates
function stopDisplay() {
  if (!isDisplaying) return;
  
  isDisplaying = false;
  clearInterval(displayInterval);
  displayInterval = null;
  lastUpdateTime = 0;
  
  // Update display one last time
  updateTimerDisplay();
}

// Listen for watchlist changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (!isExtensionValid) return;
  
  if (namespace === 'local' && changes.watchlist) {
    const newWatchlist = changes.watchlist.newValue || [];
    const isWatched = newWatchlist.includes(currentHostname);
    
    if (isWatched && !timerBox) {
      createTimerDisplay();
      // Only start if both window and document are visible
      if (document.visibilityState === 'visible' && isWindowFocused) {
        startDisplay();
        chrome.runtime.sendMessage({ 
          type: 'start-tracking', 
          url: location.href 
        }).catch(() => {
          isExtensionValid = false;
          stopDisplay();
        });
      } else {
        updateTimerDisplay();
      }
    } else if (!isWatched && timerBox) {
      stopDisplay();
      chrome.runtime.sendMessage({ 
        type: 'stop-tracking', 
        url: location.href 
      }).catch(() => {
        isExtensionValid = false;
        stopDisplay();
      });
      if (timerBox.parentNode) {
        timerBox.parentNode.removeChild(timerBox);
        timerBox = null;
      }
      currentElapsed = 0;
    }
  }
});

// Start timer display update
function startDisplayTimer() {
  if (displayInterval) {
    clearInterval(displayInterval);
  }
  
  displayInterval = setInterval(() => {
    if (isDisplaying && isExtensionValid) {
      // Get latest state from background
      chrome.runtime.sendMessage({ type: 'get-timer-state' }, (response) => {
        if (chrome.runtime.lastError) {
          isExtensionValid = false;
          stopDisplay();
          return;
        }
        
        if (response?.status === 'success' && response.timerInfo) {
          currentElapsed = response.timerInfo.elapsed;
          updateTimerDisplay();
        }
      });
    }
  }, 1000);
}

// Update the timer display
function updateTimerDisplay() {
  if (!timerBox) return;
  
  timerBox.innerHTML = `
    <span style="font-weight: 500; margin-right: 5px;">Just Be Aware:</span>
    <span>${formatTime(currentElapsed)}</span>
  `;
}

function createTimerDisplay() {
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
    
    // Initial display
    updateTimerDisplay();
  }
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  } else {
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (!isExtensionValid) return;
  
  stopDisplay();
  chrome.runtime.sendMessage({ 
    type: 'stop-tracking', 
    url: location.href 
  }).catch(() => {
    isExtensionValid = false;
    stopDisplay();
  });
});
