const themeToggle = document.getElementById('theme-toggle');
const themeStatus = document.getElementById('theme-status');
const statusMsg = document.getElementById('status');

const portInput = document.getElementById('port-input');

// Load saved settings
chrome.storage.local.get(['theme', 'morgi_port'], (res) => {
    const isLight = res.theme === 'light';
    themeToggle.checked = isLight;
    updateStatusText(isLight);
    
    if (res.morgi_port) {
        portInput.value = res.morgi_port;
    }
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

portInput.onchange = () => {
    let newPort = parseInt(portInput.value);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
        newPort = 8000;
        portInput.value = 8000;
    }
    chrome.storage.local.set({ morgi_port: newPort }, () => {
        statusMsg.textContent = "Port saved successfully!";
        showStatus();
        setTimeout(() => { statusMsg.textContent = "Settings saved successfully!"; }, 2000);
    });
};

function showStatus() {
    statusMsg.classList.add('show');
    setTimeout(() => {
        statusMsg.classList.remove('show');
    }, 2000);
}
