const themeToggle = document.getElementById('theme-toggle');
const themeStatus = document.getElementById('theme-status');
const statusMsg = document.getElementById('status');

// Load saved settings
chrome.storage.local.get(['theme'], (res) => {
    const isLight = res.theme === 'light';
    themeToggle.checked = isLight;
    updateStatusText(isLight);
});

// Save on change
themeToggle.onchange = () => {
    const isLight = themeToggle.checked;
    const themeValue = isLight ? 'light' : 'dark';

    chrome.storage.local.set({ theme: themeValue }, () => {
        updateStatusText(isLight);
        showStatus();
        
        // Notify all tabs (including dashboard) about the theme change
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'THEME_CHANGED', 
                    theme: themeValue 
                }).catch(() => {
                    // Ignore errors for tabs without content scripts
                });
            });
        });
    });
};

function updateStatusText(isLight) {
    themeStatus.textContent = isLight ? 'Light Mode' : 'Dark Mode';
    themeStatus.style.color = isLight ? '#2563eb' : '#f8fafc';
}

function showStatus() {
    statusMsg.classList.add('show');
    setTimeout(() => {
        statusMsg.classList.remove('show');
    }, 2000);
}
