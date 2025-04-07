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

// Request latest tracking data from background page and return a promise
function requestLatestData() {
  return new Promise((resolve) => {
    // Force a sync of all active timers before getting data
    chrome.runtime.sendMessage({ type: 'sync-all-timers' }, (response) => {
      // Give a little time for the sync to complete
      setTimeout(() => {
        resolve(true);
      }, 200); // Wait 200ms to ensure sync completes
    });
  });
}

// Load summary data
async function loadSummary() {
  // First ensure all current tracking data is saved
  await requestLatestData();
  
  // Now get the updated data
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
    
    // Create an array to store sites with their aggregated times
    const siteData = [];
    
    // Calculate time for each site
    watchlist.forEach(site => {
      let siteTime = 0;
      
      // Sum up time for the selected period across all dates
      for (const date of dateRange) {
        if (sites[site] && sites[site][date]) {
          siteTime += sites[site][date];
        }
      }
      
      // Add to total time
      totalTime += siteTime;
      
      // Store site data for display - skip sites with zero time for non-today views
      if (siteTime > 0 || activePeriod === 'today') {
        siteData.push({
          url: site,
          time: siteTime
        });
      }
    });
    
    // Sort by time spent (descending) then alphabetically if times are equal
    siteData.sort((a, b) => {
      if (b.time !== a.time) {
        return b.time - a.time; // Most time first
      }
      return a.url.localeCompare(b.url); // Alphabetical if tied
    });
    
    // If no sites have time yet, show empty state
    if (siteData.length === 0) {
      summary.innerHTML = '<div class="empty-state">No activity data yet</div>';
      document.getElementById('total-time').textContent = '0s';
      return;
    }
    
    // Display each site
    siteData.forEach(site => {
      const siteElement = document.createElement('div');
      siteElement.className = 'site';
      siteElement.innerHTML = `
        <div class="site-url">${site.url}</div>
        <div class="site-time">${formatTime(site.time)}</div>
      `;
      summary.appendChild(siteElement);
    });
    
    // Update total time
    document.getElementById('total-time').textContent = formatTime(totalTime);
    
    // Update the time period label
    let periodLabel = 'Today';
    if (activePeriod === 'week') periodLabel = 'This Week';
    if (activePeriod === 'month') periodLabel = 'This Month';
    if (activePeriod === 'year') periodLabel = 'This Year';
    
    const totalTimeLabel = document.querySelector('.total-time span:first-child');
    if (totalTimeLabel) {
      totalTimeLabel.textContent = `Total ${periodLabel}:`;
    }
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


function getDateRange(period) {
  const dates = [];
  const today = new Date();

  let start;

  switch (period) {
    case 'today':
      dates.push(formatDate(today));
      break;

    case 'week':
      // Start on Monday of the current week
      start = new Date(today);
      const dayOfWeek = start.getDay(); // 0 (Sun) to 6 (Sat)
      const diffToMonday = (dayOfWeek + 6) % 7; // shift so Monday is 0
      start.setDate(today.getDate() - diffToMonday);
      while (start <= today) {
        dates.push(formatDate(new Date(start)));
        start.setDate(start.getDate() + 1);
      }
      break;

    case 'month':
      // Start on the 1st of the current month
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      while (start <= today) {
        dates.push(formatDate(new Date(start)));
        start.setDate(start.getDate() + 1);
      }
      break;

    case 'year':
      // Start on January 1st of the current year
      start = new Date(today.getFullYear(), 0, 1);
      while (start <= today) {
        dates.push(formatDate(new Date(start)));
        start.setDate(start.getDate() + 1);
      }
      break;
  }

  return dates;
}



// // Get array of dates for the selected time period
// function getDateRange(period) {
//   const dates = [];
//   const today = new Date();
  
//   switch (period) {
//     case 'today':
//       dates.push(formatDate(today));
//       break;
//     case 'week':
//       for (let i = 0; i < 7; i++) {
//         const date = new Date(today);
//         date.setDate(today.getDate() - i);
//         dates.push(formatDate(date));
//       }
//       break;
//     case 'month':
//       for (let i = 0; i < 30; i++) {
//         const date = new Date(today);
//         date.setDate(today.getDate() - i);
//         dates.push(formatDate(date));
//       }
//       break;
//     case 'year':
//       for (let i = 0; i < 365; i++) {
//         const date = new Date(today);
//         date.setDate(today.getDate() - i);
//         dates.push(formatDate(date));
//       }
//       break;
//   }
  
//   return dates;
// }

// Format date to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Format seconds to readable time with rounding to nearest second
function formatTime(seconds) {
  // Round to nearest second for display
  seconds = Math.round(seconds);
  
  if (seconds === 0) {
    return '0s';
  }
  
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
  
  if (hours < 24) {
    return `${hours}h ${remainingMinutes}m`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  return `${days}d ${remainingHours}h ${remainingMinutes}m`;
}

// Add year option to time period buttons if not already present
function ensureYearOption() {
  const timeSelector = document.querySelector('.time-selector');
  if (!timeSelector) return;
  
  // Check if year button already exists
  if (!document.querySelector('.time-btn[data-period="year"]')) {
    const yearBtn = document.createElement('button');
    yearBtn.className = 'time-btn';
    yearBtn.dataset.period = 'year';
    yearBtn.textContent = 'Year';
    
    yearBtn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      yearBtn.classList.add('active');
      activePeriod = 'year';
      loadSummary();
    });
    
    timeSelector.appendChild(yearBtn);
  }
}

// Initialize popup
async function initializePopup() {
  ensureYearOption();
  await requestLatestData();
  loadSummary();
  loadWatchlist();
}

// Start initialization when popup opens
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();
});
  