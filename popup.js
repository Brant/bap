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
    
    watchlist.forEach(site => {
      let siteTime = 0;
      
      // Sum up time for the selected period
      for (const date of dateRange) {
        siteTime += (sites[site]?.[date] || 0);
      }
      
      totalTime += siteTime;
      
      if (siteTime > 0) {
        const siteElement = document.createElement('div');
        siteElement.className = 'site';
        siteElement.innerHTML = `
          <div class="site-url">${site}</div>
          <div class="site-time">${formatTime(siteTime)}</div>
        `;
        summary.appendChild(siteElement);
      }
    });
    
    // Update total time
    document.getElementById('total-time').textContent = formatTime(totalTime);
    
    // Show message if no sites
    if (summary.children.length === 0) {
      summary.innerHTML = '<div class="empty-state">No activity data yet</div>';
    }
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

// Load summary on popup open
loadSummary();
  