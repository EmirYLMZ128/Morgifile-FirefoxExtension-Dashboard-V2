// =====================
// SITE DISABLE CHECK
// =====================
chrome.storage.local.get([window.location.hostname, 'theme'], (res) => {
  // Theme apply
  if (res.theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }

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
// MAIN INITIALIZATION
// =====================
function mainExtensionCode() {
  document.addEventListener("contextmenu", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "LOG_NEAREST_IMAGE") {
      const images = findBestImages(lastX, lastY);
      if (!images.length) return;

      images.length === 1
        // ✨ GÜNCELLEME: Artık elementi de (images[0].element) gönderiyoruz
        ? showCategoryModal(images[0].url, images[0].element)
        : showInitialPicker(images);
    }

    if (request.action === "THEME_CHANGED") {
      const isLight = request.theme === 'light';
      const bodies = [document.body, document.getElementById('morgi-picker-host'), document.getElementById('morgi-main-host')];
      
      bodies.forEach(el => {
        if (!el) return;
        if (isLight) el.classList.add('light-mode');
        else el.classList.remove('light-mode');
      });
    }
  });
}

// =====================
// SHADOW DOM SETUP
// =====================
function createShadowHost(id) {
  document.getElementById(id)?.remove();

  const host = document.createElement("div");
  host.id = id;
  host.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;";
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
  
  // Apply theme to host
  chrome.storage.local.get(['theme'], (res) => {
    if (res.theme === 'light') host.classList.add('light-mode');
  });

  return { host, shadow, overlay };
}

// =====================
// UI: INITIAL MULTI-IMAGE PICKER
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
      const resEl = item.querySelector(".img-resolution");
      if(resEl) resEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
    };
    img.onerror = () => {
      const resEl = item.querySelector(".img-resolution");
      if(resEl) resEl.innerText = "Unknown Size";
    };

    item.innerHTML = `
      <img src="${imgData.url}">
      <span class="img-resolution">Loading...</span>
    `;

    item.onclick = () => {
      host.remove();
      // ✨ GÜNCELLEME: Seçilen resmin elementini de gönderiyoruz
      showCategoryModal(imgData.url, imgData.element);
    };

    grid.appendChild(item);
  });

  overlay.appendChild(modal);
}

// =====================
// UI: SINGLE IMAGE CATEGORY MODAL
// =====================
// ✨ GÜNCELLEME: Parametrelere imgElement eklendi
async function showCategoryModal(imgUrl, imgElement) {
  categoryCache = null; 
  const { host, shadow, overlay } = createShadowHost("morgi-main-host");
  overlay.appendChild(buildModalHTML(imgUrl, location.hostname));
  // ✨ GÜNCELLEME: imgElement'i içeri aktarıyoruz
  setupModalLogic(shadow, host, imgUrl, imgElement);
}

function buildModalHTML(imgUrl, siteAddress) {
  const modal = document.createElement("div");
  modal.className = "modal";
  
  const displayUrl = imgUrl.length > 45 ? imgUrl.substring(0, 45) + '...' : imgUrl;

  modal.innerHTML = `
    <div class="left"><img src="${imgUrl}"></div>
    <div class="right">
      <div>
        <h2>MorgiFile Details</h2>
        <div class="info-row">
          <label>Image Link</label>
          <a href="${imgUrl}" target="_blank" class="info-link">${displayUrl}</a>
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
// LOGIC: MODAL INTERACTIONS
// =====================
// ✨ GÜNCELLEME: Parametrelere imgElement eklendi
async function setupModalLogic(shadow, host, imgUrl, imgElement) {
  const resEl = shadow.getElementById("radar-res-val");
  const btn = shadow.getElementById("save-btn");
  const trigger = shadow.getElementById("radar-trigger");
  const optionsMenu = shadow.getElementById("radar-options");

  btn.style.cssText = `
    width: 100%;
    padding: 12px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    margin-top: 10px;
  `;

  const img = new Image();
  img.src = imgUrl;
  img.onload = () => {
    resEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
  };
  img.onerror = () => {
    resEl.innerText = "Unknown Size";
  };

  const categories = await loadCategories();
  
  const createCatWrapper = document.createElement("div");
  createCatWrapper.style.cssText = "padding: 10px; display: none; gap: 8px; border-bottom: 1px solid #2a2a2a; background: #252525;";
  createCatWrapper.innerHTML = `
    <input type="text" id="new-cat-input" placeholder="Category name..." style="flex:1; background:#121212; border:1px solid #333; color:#eee; padding:8px; border-radius:6px; outline:none; font-size:13px; font-family:inherit;">
    <button id="new-cat-submit" style="width:auto; padding:8px 12px; background:#2563eb; color:#fff; border-radius:6px; font-size:13px; cursor:pointer; border:none; transition:0.2s;">Add</button>
  `;
  createCatWrapper.onclick = (e) => e.stopPropagation();

  const submitBtn = createCatWrapper.querySelector("#new-cat-submit");
  const inputEl = createCatWrapper.querySelector("#new-cat-input");

  const newCatBtn = document.createElement("div");
  newCatBtn.className = "custom-option";
  newCatBtn.innerHTML = `<strong style="color: #2563eb;">+ Create New Category</strong>`;
  
  newCatBtn.onclick = (e) => {
    e.stopPropagation();
    newCatBtn.style.display = "none";
    createCatWrapper.style.display = "flex";
    inputEl.focus();
  };

  submitBtn.onclick = async (e) => {
    e.stopPropagation(); 
    const newCatName = inputEl.value.trim();
    if (!newCatName) return;

    trigger.innerText = "⏳ Checking...";
    const imageExists = await isImageAlreadySaved(imgUrl);
    
    if (imageExists) {
      showInlineMessage("⚠️ This image is already archived. Category creation aborted.", "#FBBF24");
      resetCategoryCreationUI();
      return; 
    }

    const existingCategory = categories.find(cat => cat.name.toLowerCase() === newCatName.toLowerCase());

    if (existingCategory) {
      selectCategory(existingCategory.name);
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
        selectCategory(createdCat.name);
        categoryCache = null; 
      } else {
        showCategoryError();
      }
    } catch (err) {
      showCategoryError("📡 Connection Error");
    }
  };

  function selectCategory(name) {
    trigger.innerText = name;
    btn.innerText = `💾 Save On ${name}`;
    btn.classList.add("active");
    btn.dataset.category = name;
    resetCategoryCreationUI();
  }

  function showCategoryError(msg = "⚠️ Error!") {
    trigger.innerText = msg;
    setTimeout(() => { trigger.innerText = "Select a category..."; }, 2000);
    resetCategoryCreationUI();
  }

  function resetCategoryCreationUI() {
    optionsMenu.classList.remove("show");
    createCatWrapper.style.display = "none";
    newCatBtn.style.display = "block";
    if(inputEl) inputEl.value = "";
  }

  optionsMenu.appendChild(createCatWrapper);
  optionsMenu.appendChild(newCatBtn);

  categories.forEach((cat) => {
    if (cat.isSystem) return;

    const div = document.createElement("div");
    div.className = "custom-option";
    div.innerText = cat.name;
    div.onclick = (e) => {
      e.stopPropagation();
      selectCategory(cat.name);
    };
    optionsMenu.appendChild(div);
  });
  
  trigger.onclick = (e) => {
    e.stopPropagation();
    optionsMenu.classList.toggle("show");
  };

  shadow.addEventListener("click", () => {
    resetCategoryCreationUI();
  });

  // ✨ GÜNCELLEME: Save butonuna basınca imgElement'i de yolluyoruz
  btn.onclick = () => handleSave(btn, shadow, host, imgUrl, imgElement);
}

// =====================
// PURE UNIVERSAL SOURCE URL EXTRACTOR V10.1 (Google Kutu Fix)
// =====================
function extractSourceUrl(imgElement) {
    const currentUrl = window.location.href;
    if (!imgElement) return currentUrl;

    const currentHost = window.location.hostname.replace('www.', '');
    const isValid = (href) => href && !href.startsWith('javascript') && href !== '#' && href !== currentUrl;

    // 🌟 0. ADIM: GOOGLE GÖRSELLER (Kutu Yakalama Stratejisi)
    if (currentHost.includes('google')) {
        // Önce resmi saran o "Ana Kutuyu" buluyoruz (Google'ın özel class'ları)
        const gridItem = imgElement.closest('div[jsname="dTDiAc"], div.isv-r, div.ivg-i');
        
        if (gridItem) {
            // Şimdi o kutunun İÇİNDEKİ imgres linkini arıyoruz (Amcaoğlunu bulduk!)
            const googleClickable = gridItem.querySelector('a[href*="imgres"]');
            if (googleClickable) {
                try {
                    const urlParams = new URLSearchParams(new URL(googleClickable.href).search);
                    const originalUrl = urlParams.get('imgrefurl');
                    if (originalUrl) return originalUrl;
                } catch (e) {}
                return googleClickable.href;
            }
        }
        
        const directA = imgElement.closest('a[href*="imgres"]');
        if (directA) {
             try {
                 const urlParams = new URLSearchParams(new URL(directA.href).search);
                 const originalUrl = urlParams.get('imgrefurl');
                 if (originalUrl) return originalUrl;
             } catch (e) {}
             return directA.href;
        }
    }

    let closestLink = imgElement.closest('a');
    if (closestLink && isValid(closestLink.href)) {
        const path = closestLink.pathname.toLowerCase();
        if (/\/(photos|artwork|sites|image-|p\/|gallery|shots|comments)\//.test(path)) {
            if (!path.includes('download')) return closestLink.href;
        }
    }

    let parent = imgElement;
    let candidates = [];
    const containerTags = ['ARTICLE', 'SECTION', 'FIGURE', 'LI', 'PROJECTS-LIST-ITEM', 'DIV'];

    for (let i = 0; i < 12; i++) {
        if (!parent || parent.tagName === 'BODY') break;

        const links = Array.from(parent.querySelectorAll('a')).filter(a => isValid(a.href));
        
        links.forEach(link => {
            let score = 0;
            const urlObj = new URL(link.href);
            const linkHost = urlObj.hostname.replace('www.', '');
            const path = urlObj.pathname.toLowerCase();
            const fullHref = link.href.toLowerCase();
            const pathSegments = path.split('/').filter(p => p.length > 0);

            if (/\/(photos|artwork|sites|image-|p|e|v|pin|sh|shots|gallery|article|post|reels|item|product|gp|details|comments)\//.test(path)) {
                score += 300; 
            }

            if (/\d{5,}/.test(path) || pathSegments.some(s => s.length > 10)) score += 100;

            if (/(download|login|signup|signin|register|subscribe|membership|auth|search|tags|category|branding|author|profile|settings|about|contact|legal|help|explore|policy|rules|itunes|apple|play\.google|canva|microsoft)/.test(fullHref)) {
                score -= 600; 
            }

            if (pathSegments.length === 1 && !/\d{5,}/.test(path)) score -= 400;


            if (linkHost === currentHost) score += 100; 
            score += (pathSegments.length * 25);

            candidates.push({ href: link.href, score: score, distance: i });
        });

        if (i > 2 && containerTags.some(t => parent.tagName === t || parent.classList.contains(t.toLowerCase())) && candidates.length > 0) {
            const best = candidates.sort((a, b) => b.score - a.score)[0];
            if (best.score > 200) break;
        }

        parent = parent.parentElement;
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
        if (candidates[0].score > 0) return candidates[0].href;
    }


    const spaRoutes = { 'data-elt-id': '/e/', 'data-shot-id': '/shots/', 'data-pin-id': '/pin/', 'data-post-id': '/post/' };
    let idParent = imgElement;
    for (let i = 0; i < 8; i++) {
        if (!idParent) break;
        if (idParent.attributes) {
            for (let attr of idParent.attributes) {
                if (spaRoutes[attr.name]) return `${window.location.origin}${spaRoutes[attr.name]}${attr.value}`;
            }
        }
        idParent = idParent.parentElement;
    }

    return currentUrl;
}

// =====================
// LOGIC: SAVING TO BACKEND
// =====================
async function handleSave(btn, shadow, host, imgUrl, imgElement) {
  if (!btn.classList.contains("active")) return;

  const exists = await isImageAlreadySaved(imgUrl);
  if (exists) {
    showInlineMessage("⚠️ This image is already archived. If it’s not visible, it might be in the trash.", "#FBBF24");
    return;
  }

  let finalWidth = 0;
  let finalHeight = 0;

  if (imgElement && imgElement.tagName === 'IMG') {
      finalWidth = imgElement.naturalWidth || imgElement.clientWidth || 0;
      finalHeight = imgElement.naturalHeight || imgElement.clientHeight || 0;
  }

  if (finalWidth === 0 || finalHeight === 0) {
      const resText = shadow.getElementById("radar-res-val").innerText;
      const { width, height } = parseResolution(resText);
      finalWidth = width || 0;
      finalHeight = height || 0;
  }

  const sourceUrl = extractSourceUrl(imgElement);

  const payload = {
    site: location.hostname,
    url: imgUrl, 
    category: btn.dataset.category,
    sourceUrl: sourceUrl, 
    width: finalWidth,   
    height: finalHeight  
  };

  console.log("🚀 Python'a Gönderilen Veri:", payload);

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
      const errData = await res.json().catch(() => "");
      console.error("❌ Backend Error:", errData);
      btn.innerText = "❌ Error!";
      btn.style.background = "#EF4444";
    }
  } catch (err) {
    console.error("📡 Fetch Error:", err);
    btn.innerText = "📡 No connection!";
    btn.style.background = "#EF4444";
  }
}

// =====================
// UTILITIES
// =====================
function parseResolution(text) {
  const m = text.match(/(\d+)\s*x\s*(\d+)/);
  return m ? { width: parseInt(m[1]), height: parseInt(m[2]) } : { width: 0, height: 0 };
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

async function isImageAlreadySaved(url) {
  const safeurl = normalizeUrl(url);
  const list = await new Promise((resolve) => {
    chrome.storage.local.get(["savedImages"], (res) => resolve(res.savedImages || []));
  });

  if (!list.includes(safeurl)) return false;

  try {
    const res = await fetch(`http://127.0.0.1:8000/check-image?url=${encodeURIComponent(url)}`);
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

function findBestImages(x, y) {
  const els = document.querySelectorAll("img,[role='img'],[style*='background-image']");
  const matches = [];

  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;

    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist > 30) continue;

    let url = el.tagName === "IMG"
        ? el.currentSrc || el.src
        : (getComputedStyle(el).backgroundImage.match(BG_IMAGE_REGEX) || [])[1];

    if (url && !url.includes("data:image/svg")) {
      // ✨ GÜNCELLEME: Burada artık "element: el" diyerek HTML etiketini de ekliyoruz
      matches.push({ url, area: r.width * r.height, dist, element: el });
    }
  }

  return [...new Map(matches.map((m) => [m.url, m])).values()].sort((a, b) => a.dist - b.dist || b.area - a.area);
}

function showInlineMessage(text, bgColor = "#1e1e1e") {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position: fixed;
    top: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: ${bgColor === "#FBBF24" ? "#000" : "#fff"};
    padding: 14px 24px;
    border-radius: 14px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    z-index: 2147483647; /* Modalın en üstünde görünmesi için */
    font-size: 14px;
    font-weight: 600;
    border: 1px solid rgba(255,255,255,0.1);
    transition: all 0.3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => el.remove(), 300);
  }, 2500);
}