const MENU_ID = "logImageURL";
const ICON_ACTIVE = {
  "16": "icons/16.png",
  "32": "icons/32.png",
  "48": "icons/48.png",
  "128": "icons/128.png"
};
const ICON_DISABLED = {
  "16": "icons/16Pas.png",
  "32": "icons/32Pas.png",
  "48": "icons/48Pas.png",
  "128": "icons/128Pas.png"
};

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function refreshContextMenu(enabled) {
  chrome.contextMenus.removeAll(() => {
    if (enabled) {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "🔗 Add to Morgifile",
        contexts: ["all"]
      });
    }
  });
}

function updateContextMenu(tabId, tab) {
  if (!tab?.url) return;

  const hostname = getHostname(tab.url);
  if (!hostname) return;

  chrome.storage.local.get(hostname, (res) => {
    const disabled = res[hostname] === true;

    chrome.action.setIcon({
      tabId,
      path: disabled ? ICON_DISABLED : ICON_ACTIVE
    });

    refreshContextMenu(!disabled);
  });
}

/* TAB EVENTS */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => updateContextMenu(tabId, tab));
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") {
    updateContextMenu(tabId, tab);
  }
});

/* INSTALL */
chrome.runtime.onInstalled.addListener(() => {
  refreshContextMenu(true);
  // ❌ No notification
});

/* CONTEXT MENU */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "LOG_NEAREST_IMAGE"
    });
  }
});

/* SILENT AUTO-SCAN PORT LOGIC */
let isScanning = false;

async function scanForMorgiFile() {
  if (isScanning) return;
  isScanning = true;

  console.log("MorgiFile: Starting silent parallel port scan (8000-8050)...");

  const scanPromises = [];

  for (let port = 8000; port <= 8050; port++) {
    scanPromises.push((async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200);
        
        const res = await fetch(`http://127.0.0.1:${port}/api/ping`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.status === "morgifile_online") {
            return port;
          }
        }
      } catch (e) {
        // Connection refused or timeout, ignore
      }
      return null;
    })());
  }

  const results = await Promise.all(scanPromises);
  const foundPort = results.find(p => p !== null);

  if (foundPort) {
    console.log(`✅ MorgiFile found on port ${foundPort}!`);
    chrome.storage.local.set({ morgi_port: foundPort });
  } else {
    // If we reach here, all 50 ports failed
    console.log("❌ MorgiFile not found in range 8000-8050.");
    chrome.notifications.create("morgifile_not_found", {
      type: "basic",
      iconUrl: "icons/128.png",
      title: "MorgiFile Offline",
      message: "Uygulama kapalı. Lütfen MorgiFile uygulamasını başlatın!"
    });
  }
  
  isScanning = false;
}

/* API PROXY — Tüm backend istekleri service worker üzerinden geçer (CORS/PNA bypass) */
async function bgFetch(path, options = {}) {
  const result = await chrome.storage.local.get(["morgi_port"]);
  const port = result.morgi_port || 8000;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, options);
  return res;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCAN_FOR_MORGIFILE") {
    scanForMorgiFile();
    return;
  }

  if (request.action === "BG_GET_CATEGORIES") {
    bgFetch("/categories")
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (request.action === "BG_CHECK_IMAGE") {
    bgFetch(`/check-image?url=${encodeURIComponent(request.url)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (request.action === "BG_ADD_IMAGE") {
    bgFetch("/add-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(data => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (request.action === "BG_CREATE_CATEGORY") {
    bgFetch("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: request.name })
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
