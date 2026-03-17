// =====================
// SITE DISABLE CHECK
// =====================
chrome.storage.local.get([window.location.hostname], (res) => {
  if (res[window.location.hostname] === true) {
    console.log("MorgiFile is Deactive on this site");
    return;
  }
  mainExtensionCode();
});

// =====================
// GLOBALS
// =====================
let lastX = 0;
let lastY = 0;
let categoryCache = null;

const BG_IMAGE_REGEX = /url\(["']?([^"']*)["']?\)/;

// =====================
// MAIN
// =====================
function mainExtensionCode() {
  document.addEventListener(
    "contextmenu",
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
    },
    true
  );

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "LOG_NEAREST_IMAGE") {
      const images = findBestImages(lastX, lastY);
      if (!images.length) return;

      images.length === 1
        ? showCategoryModal(images[0].url)
        : showInitialPicker(images);
    }
  });
}

// =====================
// SHADOW HOST
// =====================
function createShadowHost(id) {
  document.getElementById(id)?.remove();

  const host = document.createElement("div");
  host.id = id;
  host.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999999;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const overlay = document.createElement("div");
  overlay.className = "radar-overlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) host.remove();
  });

  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", chrome.runtime.getURL("modal/style.css"));

  shadow.append(link, overlay);
  return { host, shadow, overlay };
}

// =====================
// INITIAL PICKER
// =====================
function showInitialPicker(images) {
  const { host, shadow, overlay } = createShadowHost("morgi-picker-host");

  const modal = document.createElement("div");
  modal.className = "picker-modal";
  modal.innerHTML = `
    <h2 style="color:#fff;text-align:center;">Select an image to save</h2>
    <div class="grid"></div>
  `;

  const grid = modal.querySelector(".grid");

  images.forEach((imgData) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = new Image();
    img.src = imgData.url;
    img.onload = () => {
      item.querySelector(
        ".img-resolution"
      ).innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
    };

    item.innerHTML = `
      <img src="${imgData.url}">
      <span class="img-resolution">Loading...</span>
    `;

    item.onclick = () => {
      host.remove();
      showCategoryModal(imgData.url);
    };

    grid.appendChild(item);
  });

  overlay.appendChild(modal);
}

// =====================
// CATEGORY MODAL
// =====================
async function showCategoryModal(imgUrl) {
  // Always fetch a fresh list on open
  categoryCache = null;

  const { host, shadow, overlay } = createShadowHost("morgi-main-host");
  overlay.appendChild(buildModalHTML(imgUrl, location.hostname));
  setupModalLogic(shadow, host, imgUrl);
}

// =====================
// MODAL HTML
// =====================
function buildModalHTML(imgUrl, siteAddress) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="left"><img src="${imgUrl}"></div>
    <div class="right">
      <div>
        <h2>MorgiFile Details</h2>
        <div class="info-row">
          <label>Image Link</label>
          <a href="${imgUrl}" target="_blank" class="info-link">${imgUrl.substring(
    0,
    45
  )}...</a>
        </div>
        <div class="info-row">
          <label>Image Sizes</label>
          <div class="info-val" id="radar-res-val">Loading...</div>
        </div>
        <div class="info-row">
          <label>Site Link</label>
          <div class="info-val">${siteAddress}</div>
        </div>
        <label>Category</label>
        <div class="custom-select-wrapper">
          <div class="custom-select" id="radar-trigger">Select a category...</div>
          <div class="custom-options" id="radar-options"></div>
        </div>
      </div>
      <button id="save-btn">Save</button>
    </div>
  `;
  return modal;
}

// =====================
// MODAL LOGIC
// =====================
async function setupModalLogic(shadow, host, imgUrl) {
  const resEl = shadow.getElementById("radar-res-val");
  const btn = shadow.getElementById("save-btn");
  const trigger = shadow.getElementById("radar-trigger");
  const optionsMenu = shadow.getElementById("radar-options");

  const img = new Image();
  img.src = imgUrl;
  img.onload = () => {
    resEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
  };

  const categories = await loadCategories();
  
  const createCatWrapper = document.createElement("div");
  createCatWrapper.style.cssText = "padding: 10px; display: none; gap: 8px; border-bottom: 1px solid #2a2a2a; background: #252525;";
  createCatWrapper.innerHTML = `
    <input type="text" id="new-cat-input" placeholder="Category name..." style="flex:1; background:#121212; border:1px solid #333; color:#eee; padding:8px; border-radius:6px; outline:none; font-size:13px; font-family:inherit;">
    <button id="new-cat-submit" style="width:auto; padding:8px 12px; background:#6366f1; color:#fff; border-radius:6px; font-size:13px; cursor:pointer; border:none; transition:0.2s;">Add</button>
  `;
  
  createCatWrapper.onclick = (e) => e.stopPropagation();

  const submitBtn = createCatWrapper.querySelector("#new-cat-submit");
  const inputEl = createCatWrapper.querySelector("#new-cat-input");

  submitBtn.onclick = async (e) => {
    e.stopPropagation(); 
    const newCatName = inputEl.value.trim();
    
    if (!newCatName) return;

    trigger.innerText = "⏳ Checking...";
    const imageExists = await isImageAlreadySaved(imgUrl);
    
    if (imageExists) {
      showInlineMessage("⚠️ This image is already archived. Category creation aborted.");
      optionsMenu.classList.remove("show");
      createCatWrapper.style.display = "none";
      newCatBtn.style.display = "block";
      inputEl.value = "";
      trigger.innerText = "Select a category...";
      return; 
    }

    const existingCategory = categories.find(
      cat => cat.name.toLowerCase() === newCatName.toLowerCase()
    );

    if (existingCategory) {
      trigger.innerText = existingCategory.name;
      btn.innerText = `💾 Save On ${existingCategory.name}`;
      btn.classList.add("active");
      btn.dataset.category = existingCategory.name;
      
      optionsMenu.classList.remove("show");
      createCatWrapper.style.display = "none";
      newCatBtn.style.display = "block";
      inputEl.value = "";
      return; 
    }

    trigger.innerText = "⏳ Creating...";
    optionsMenu.classList.remove("show"); 

    try {
      const res = await fetch("http://127.0.0.1:8000/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName })
      });

      if (res.ok) {
        const createdCat = await res.json();
        trigger.innerText = createdCat.name;
        btn.innerText = `💾 Save On ${createdCat.name}`;
        btn.classList.add("active");
        btn.dataset.category = createdCat.name;
        categoryCache = null; 
      } else {
        trigger.innerText = "⚠️ Error!";
        setTimeout(() => { trigger.innerText = "Select a category..."; }, 2000);
      }
    } catch (err) {
      trigger.innerText = "📡 Connection Error";
      setTimeout(() => { trigger.innerText = "Select a category..."; }, 2000);
    }
    
    createCatWrapper.style.display = "none";
    newCatBtn.style.display = "block";
    inputEl.value = "";
  };

  const newCatBtn = document.createElement("div");
  newCatBtn.className = "custom-option";
  newCatBtn.innerHTML = `<strong style="color: #6366f1;">+ Create New Category</strong>`;
  
  newCatBtn.onclick = (e) => {
    e.stopPropagation();
    newCatBtn.style.display = "none";
    createCatWrapper.style.display = "flex";
    inputEl.focus();
  };

  optionsMenu.appendChild(createCatWrapper);
  optionsMenu.appendChild(newCatBtn);

  // LIST EXISTING CATEGORIES
  categories.forEach((cat) => {
    // 🛡️ HIDES SYSTEM CATEGORIES USING THE NEW 'isSystem' FLAG
    if (cat.isSystem) return;

    const div = document.createElement("div");
    div.className = "custom-option";
    div.innerText = cat.name;
    div.onclick = (e) => {
      e.stopPropagation();
      trigger.innerText = cat.name;
      optionsMenu.classList.remove("show");
      
      createCatWrapper.style.display = "none";
      newCatBtn.style.display = "block";
      inputEl.value = "";

      btn.innerText = `💾 Save On ${cat.name}`;
      btn.classList.add("active");
      btn.dataset.category = cat.name;
    };
    optionsMenu.appendChild(div);
  });
 
  trigger.onclick = (e) => {
    e.stopPropagation();
    optionsMenu.classList.toggle("show");
  };

  shadow.addEventListener("click", () => {
    optionsMenu.classList.remove("show");
    createCatWrapper.style.display = "none";
    newCatBtn.style.display = "block";
    if(inputEl) inputEl.value = "";
  });

  btn.onclick = () => handleSave(btn, shadow, host, imgUrl);
}

// =====================
// SAVE HANDLER
// =====================
async function handleSave(btn, shadow, host, imgUrl) {
  const exists = await isImageAlreadySaved(imgUrl);
  if (exists) {
    showInlineMessage("⚠️ This image is already archived. If it’s not visible, it might be in the trash.");
    return;
  }

  if (!btn.classList.contains("active")) return;

  const { width, height } = parseResolution(
    shadow.getElementById("radar-res-val").innerText
  );

  const payload = {
    site: location.hostname,
    originalUrl: imgUrl,
    category: btn.dataset.category,
    width,
    height
  };

  btn.innerText = "⏳ Saving...";
  btn.classList.remove("active");
  btn.style.background = "#4b4b4b";

  try {
    const res = await fetch("http://127.0.0.1:8000/add-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      markImageAsSaved(imgUrl);
      btn.innerText = "✅ Saved successfully!!";
      btn.style.background = "#10b981";
      setTimeout(() => host.remove(), 1200);
    } else {
      btn.innerText = "❌ Error!";
      btn.style.background = "#ef4444";
    }
  } catch {
    btn.innerText = "📡 No connection!";
    btn.style.background = "#ef4444";
  }
}

// =====================
// HELPERS
// =====================
function parseResolution(text) {
  const m = text.match(/(\d+)\s*x\s*(\d+)/);
  return m
    ? { width: parseInt(m[1]), height: parseInt(m[2]) }
    : { width: 0, height: 0 };
}

async function loadCategories() {
  if (categoryCache) return categoryCache;
  try {
    const res = await fetch("http://127.0.0.1:8000/categories");
    const data = await res.json();
    categoryCache = data.categories;
  } catch {
    categoryCache = [{ name: "Fallback", isSystem: false }];
  }
  return categoryCache;
}

// =====================
// DUPLICATE CHECK (LOCAL)
// =====================
async function isImageAlreadySaved(url) {
  const safeurl = normalizeUrl(url);
  const list = await new Promise((resolve) => {
    chrome.storage.local.get(["savedImages"], (res) => {
      resolve(res.savedImages || []);
    });
  });

  if (!list.includes(safeurl)) return false;

  try {
    const res = await fetch(
      `http://127.0.0.1:8000/check-image?url=${encodeURIComponent(url)}`
    );

    if (!res.ok) throw new Error();
    const data = await res.json();

    if (!data.exists) {
      const updated = list.filter((u) => u !== safeurl);
      chrome.storage.local.set({ savedImages: updated });
      return false;
    }

    return true;
  } catch {
    return true; 
  }
}

function markImageAsSaved(url) {
  const incomingSafe = normalizeUrl(url);
  chrome.storage.local.get(["savedImages"], (res) => {
    const list = res.savedImages || [];
    if (!list.includes(incomingSafe)) {
      list.push(incomingSafe);
      chrome.storage.local.set({ savedImages: list });
    }
  });
}

function normalizeUrl(url) {
  return url.split("?")[0];
}

// =====================
// IMAGE FINDER
// =====================
function findBestImages(x, y) {
  const els = document.querySelectorAll(
    "img,[role='img'],[style*='background-image']"
  );
  const matches = [];

  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;

    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist > 30) continue;

    let url =
      el.tagName === "IMG"
        ? el.currentSrc || el.src
        : (getComputedStyle(el).backgroundImage.match(BG_IMAGE_REGEX) || [])[1];

    if (url && !url.includes("data:image/svg")) {
      matches.push({ url, area: r.width * r.height, dist });
    }
  }

  return [...new Map(matches.map((m) => [m.url, m])).values()].sort(
    (a, b) => a.dist - b.dist || b.area - a.area
  );
}

function showInlineMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e1e;
    color: #fff;
    padding: 12px 20px;
    border-radius: 12px;
    border: 1px solid #333;
    z-index: 99999999;
    font-size: 14px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}