// Get current URL and update display
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const currentUrl = new URL(tabs[0].url).hostname;
  document.getElementById('current-url').textContent = currentUrl;
  
  // Check if the current site is in the watchlist
  chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
    const toggleBtn = document.getElementById('toggle-btn');
    if (watchlist.includes(currentUrl)) {
      toggleBtn.textContent = 'Remove from Watchlist';
      toggleBtn.classList.add('remove');
    } else {
      toggleBtn.textContent = 'Add to Watchlist';
      toggleBtn.classList.remove('remove');
    }
  });
  
  // Request background page to save current site tracking data if active
  chrome.runtime.sendMessage({ type: 'sync-tracking-data' });
});

// Handle watchlist toggle button (collapse/expand)
document.getElementById('toggle-watchlist-btn').addEventListener('click', () => {
  const container = document.querySelector('.watchlist-container');
  container.classList.toggle('collapsed');
  
  // Store collapsed state in storage
  chrome.storage.local.get(['uiState'], ({ uiState = {} }) => {
    uiState.watchlistCollapsed = container.classList.contains('collapsed');
    chrome.storage.local.set({ uiState });
  });
});

// Restore UI state (collapsed/expanded) or use default collapsed
chrome.storage.local.get(['uiState'], ({ uiState = {} }) => {
  // If no saved state, default to collapsed
  if (typeof uiState.watchlistCollapsed === 'undefined') {
    uiState.watchlistCollapsed = true;
    chrome.storage.local.set({ uiState });
  }
  
  if (uiState.watchlistCollapsed) {
    document.querySelector('.watchlist-container').classList.add('collapsed');
  }
});

// Toggle watchlist button
document.getElementById('toggle-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const currentUrl = new URL(tabs[0].url).hostname;
    chrome.runtime.sendMessage({ type: 'toggle-watchlist', url: currentUrl }, response => {
      const toggleBtn = document.getElementById('toggle-btn');
      if (response.isWatched) {
        toggleBtn.textContent = 'Remove from Watchlist';
        toggleBtn.classList.add('remove');
      } else {
        toggleBtn.textContent = 'Add to Watchlist';
        toggleBtn.classList.remove('remove');
      }
      loadSummary();
      loadWatchlist();
    });
  });
});

// Time period selector
const timeBtns = document.querySelectorAll('.time-btn');
let activePeriod = 'today';

timeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    timeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePeriod = btn.dataset.period;
    loadSummary();
  });
});

// Load summary data
function loadSummary() {
  chrome.storage.local.get(['sites', 'watchlist'], ({ sites = {}, watchlist = [] }) => {
    const summary = document.getElementById('summary');
    summary.innerHTML = '';
    let totalTime = 0;
    
    // Get date ranges based on selected period
    const dateRange = getDateRange(activePeriod);
    
    if (watchlist.length === 0) {
      summary.innerHTML = '<div class="empty-state">No sites in watchlist</div>';
      document.getElementById('total-time').textContent = '0s';
      return;
    }
    
    // Sort alphabetically
    watchlist.sort().forEach(site => {
      let siteTime = 0;
      
      // Sum up time for the selected period
      for (const date of dateRange) {
        siteTime += (sites[site]?.[date] || 0);
      }
      
      totalTime += siteTime;
      
      // Always show the site, even if no time tracked yet
      const siteElement = document.createElement('div');
      siteElement.className = 'site';
      siteElement.innerHTML = `
        <div class="site-url">${site}</div>
        <div class="site-time">${formatTime(siteTime)}</div>
      `;
      summary.appendChild(siteElement);
    });
    
    // Update total time
    document.getElementById('total-time').textContent = formatTime(totalTime);
  });
}

// Load watchlist management section
function loadWatchlist() {
  chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
    const watchlistContainer = document.getElementById('watchlist');
    watchlistContainer.innerHTML = '';
    
    if (watchlist.length === 0) {
      watchlistContainer.innerHTML = '<div class="empty-state">No sites in watchlist</div>';
      return;
    }
    
    // Sort alphabetically
    watchlist.sort().forEach(site => {
      const itemElement = document.createElement('div');
      itemElement.className = 'watchlist-item';
      itemElement.innerHTML = `
        <div class="site-url">${site}</div>
        <button class="remove-btn" data-site="${site}">Remove</button>
      `;
      watchlistContainer.appendChild(itemElement);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const site = e.target.dataset.site;
        removeFromWatchlist(site);
      });
    });
  });
}

// Remove a site from the watchlist
function removeFromWatchlist(site) {
  chrome.storage.local.get(['watchlist'], ({ watchlist = [] }) => {
    const updatedList = watchlist.filter(s => s !== site);
    
    chrome.storage.local.set({ watchlist: updatedList }, () => {
      // Update current site button if needed
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const currentUrl = new URL(tabs[0].url).hostname;
        if (currentUrl === site) {
          const toggleBtn = document.getElementById('toggle-btn');
          toggleBtn.textContent = 'Add to Watchlist';
          toggleBtn.classList.remove('remove');
        }
      });
      
      // Reload the lists
      loadSummary();
      loadWatchlist();
    });
  });
}

// Get array of dates for the selected time period
function getDateRange(period) {
  const dates = [];
  const today = new Date();
  
  switch (period) {
    case 'today':
      dates.push(formatDate(today));
      break;
    case 'week':
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(formatDate(date));
      }
      break;
    case 'month':
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(formatDate(date));
      }
      break;
  }
  
  return dates;
}

// Format date to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Format seconds to readable time
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}

// Set up storage change listener to refresh data when tracking updates happen
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.sites || changes.watchlist)) {
    loadSummary();
    
    if (changes.watchlist) {
      loadWatchlist();
    }
  }
});

// Initialize on popup open
requestLatestData();
loadSummary();
loadWatchlist();

// Request latest tracking data from background page
function requestLatestData() {
  chrome.runtime.sendMessage({ type: 'get-latest-data' }, (response) => {
    if (response && response.updated) {
      loadSummary();
    }
  });
}
  