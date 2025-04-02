// Basic theme detection function
function detectAndSendTheme() {
  const isDarkMode = window.matchMedia && 
                    window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  chrome.runtime.sendMessage({ 
    type: 'theme-changed', 
    isDarkMode: isDarkMode
  });
}

// Send theme information when page loads
detectAndSendTheme();

// Monitor for theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ 
      type: 'theme-changed', 
      isDarkMode: e.matches
    });
  });
} 