let timerInterval;
let seconds = 0;
let timerBox;
const currentHostname = new URL(location.href).hostname;

// Check if the current site is in the watchlist before creating the timer
chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
  if (watchlist.includes(currentHostname)) {
    createTimerDisplay();
    startTimer();
    chrome.runtime.sendMessage({ type: 'start-tracking', url: location.href });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (timerInterval) {
      clearInterval(timerInterval);
      chrome.runtime.sendMessage({ type: 'stop-tracking', url: location.href });
    }
  } else {
    // Only restart tracking if the site is in the watchlist
    chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
      if (watchlist.includes(currentHostname)) {
        chrome.runtime.sendMessage({ type: 'start-tracking', url: location.href });
        startTimer();
      }
    });
  }
});

// Listen for watchlist changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.watchlist) {
    const newWatchlist = changes.watchlist.newValue || [];
    const isWatched = newWatchlist.includes(currentHostname);
    
    if (isWatched && !timerBox) {
      // Site was added to watchlist, create timer
      createTimerDisplay();
      startTimer();
      chrome.runtime.sendMessage({ type: 'start-tracking', url: location.href });
    } else if (!isWatched && timerBox) {
      // Site was removed from watchlist, remove timer
      clearInterval(timerInterval);
      timerInterval = null;
      if (timerBox && timerBox.parentNode) {
        timerBox.parentNode.removeChild(timerBox);
        timerBox = null;
      }
      chrome.runtime.sendMessage({ type: 'stop-tracking', url: location.href });
    }
  }
});

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(() => {
    seconds++;
    if (timerBox) {
      updateTimerDisplay();
    }
  }, 1000);
}

function updateTimerDisplay() {
  timerBox.innerHTML = `<span style="font-weight: 500; margin-right: 5px;">Just Be Aware:</span>${formatTime(seconds)}`;
}

function createTimerDisplay() {
  // Only create if it doesn't exist already
  if (!timerBox) {
    timerBox = document.createElement('div');
    timerBox.style.position = 'fixed';
    timerBox.style.top = '10px';
    timerBox.style.right = '10px';
    timerBox.style.zIndex = '10000';
    timerBox.style.background = 'rgba(0,0,0,0.6)';
    timerBox.style.color = '#fff';
    timerBox.style.padding = '5px 10px';
    timerBox.style.fontSize = '16px';
    timerBox.style.fontFamily = 'Roboto, Arial, sans-serif';
    timerBox.style.borderRadius = '5px';
    timerBox.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
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
  const sec = s % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

window.addEventListener('beforeunload', () => {
  if (timerInterval) {
    chrome.runtime.sendMessage({ type: 'stop-tracking', url: location.href });
  }
});
