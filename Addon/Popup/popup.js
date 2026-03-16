document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    siteName: document.getElementById('site-name'),
    statusLabel: document.getElementById('status-label'),
    toggleBtn: document.getElementById('toggle-btn')
  };

  // 🛠️ Safer tab query for Firefox/Chrome
  const getActiveTab = () => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs.length > 0 ? tabs[0] : null);
      });
    });
  };

  // 🛠️ Defined INSIDE to access elements and hostname
  const syncUI = (hostname) => {
    return new Promise((resolve) => {
      chrome.storage.local.get([hostname], (res) => {
        const isDeactivated = !!res[hostname];
        
        if (isDeactivated) {
          elements.statusLabel.textContent = "DEACTIVE";
          elements.statusLabel.style.color = "#cf6679";
          elements.toggleBtn.textContent = "Activate MorgiFile";
          elements.toggleBtn.className = "btn-active";
        } else {
          elements.statusLabel.textContent = "ACTIVE";
          elements.statusLabel.style.color = "#03dac6";
          elements.toggleBtn.textContent = "Deactivate on this site";
          elements.toggleBtn.className = "btn-deactive";
        }
        resolve(isDeactivated);
      });
    });
  };

  const tab = await getActiveTab();
  
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
    elements.siteName.textContent = "System Page";
    elements.statusLabel.textContent = "DISABLED";
    elements.toggleBtn.disabled = true;
    elements.toggleBtn.style.opacity = "0.5";
    return;
  }

  const hostname = new URL(tab.url).hostname;
  elements.siteName.textContent = hostname;

  // Initial Sync
  await syncUI(hostname);

  // Toggle Action
  elements.toggleBtn.onclick = () => {
    chrome.storage.local.get([hostname], async (res) => {
      const newState = !res[hostname];
      
      chrome.storage.local.set({ [hostname]: newState }, async () => {
        await syncUI(hostname);
        chrome.tabs.reload(tab.id);
        
        // Brief delay before closing for better UX
        setTimeout(() => window.close(), 400);
      });
    });
  };
});