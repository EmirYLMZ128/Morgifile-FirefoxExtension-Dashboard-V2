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

async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['morgi_port'], (res) => {
      resolve(`http://127.0.0.1:${res.morgi_port || 8000}`);
    });
  });
}

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
      applyThemeToBodies(request.theme === 'light');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.theme) {
      applyThemeToBodies(changes.theme.newValue === 'light');
    }
  });
}

function applyThemeToBodies(isLight) {
  const bodies = [document.body, document.getElementById('morgi-picker-host'), document.getElementById('morgi-main-host')];
  bodies.forEach(el => {
    if (!el) return;
    if (isLight) el.classList.add('light-mode');
    else el.classList.remove('light-mode');
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
  link.setAttribute("href", chrome.runtime.getURL("modal/style.css") + "?v=" + Date.now());

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
  const h2 = document.createElement("h2");
  h2.style.cssText = "color:#fff;text-align:center;";
  h2.textContent = "Select an image to save";
  const grid = document.createElement("div");
  grid.className = "grid";
  modal.appendChild(h2);
  modal.appendChild(grid);

  images.forEach((imgData) => {
    const item = document.createElement("div");
    item.className = "grid-item";

    const img = new Image();
    img.src = imgData.url;

    img.onload = () => {
      const resEl = item.querySelector(".img-resolution");
      if (resEl) resEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} PX`;
    };
    img.onerror = () => {
      const resEl = item.querySelector(".img-resolution");
      if (resEl) resEl.innerText = "Unknown Size";
    };

    const imgEl = document.createElement("img");
    imgEl.src = imgData.url;
    const spanEl = document.createElement("span");
    spanEl.className = "img-resolution";
    spanEl.textContent = "Loading...";
    item.appendChild(imgEl);
    item.appendChild(spanEl);

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

  const leftDiv = document.createElement("div");
  leftDiv.className = "left";
  const leftImg = document.createElement("img");
  leftImg.id = "mf-left-img";
  leftImg.src = imgUrl;
  leftDiv.appendChild(leftImg);

  const rightDiv = document.createElement("div");
  rightDiv.className = "right";

  const innerDiv = document.createElement("div");

  const h2 = document.createElement("h2");
  h2.textContent = "MorgiFile Details";
  innerDiv.appendChild(h2);

  const row1 = document.createElement("div");
  row1.className = "info-row";
  const lbl1 = document.createElement("label");
  lbl1.textContent = "Image Link";
  const a1 = document.createElement("a");
  a1.target = "_blank";
  a1.className = "info-link";
  a1.id = "mf-info-link";
  a1.href = imgUrl;
  a1.textContent = displayUrl;
  row1.appendChild(lbl1);
  row1.appendChild(a1);
  innerDiv.appendChild(row1);

  const row2 = document.createElement("div");
  row2.className = "info-row";
  const lbl2 = document.createElement("label");
  lbl2.textContent = "Image Sizes";
  const val2 = document.createElement("div");
  val2.className = "info-val";
  val2.id = "radar-res-val";
  val2.textContent = "Loading...";
  row2.appendChild(lbl2);
  row2.appendChild(val2);
  innerDiv.appendChild(row2);

  const row3 = document.createElement("div");
  row3.className = "info-row";
  const lbl3 = document.createElement("label");
  lbl3.textContent = "Site Link";
  const val3 = document.createElement("div");
  val3.className = "info-val";
  val3.id = "mf-site-link";
  val3.textContent = siteAddress;
  row3.appendChild(lbl3);
  row3.appendChild(val3);
  innerDiv.appendChild(row3);

  const catLbl = document.createElement("label");
  catLbl.textContent = "Category";
  innerDiv.appendChild(catLbl);

  const selectWrapper = document.createElement("div");
  selectWrapper.className = "custom-select-wrapper";

  const trigger = document.createElement("div");
  trigger.className = "custom-select";
  trigger.id = "radar-trigger";
  trigger.textContent = "Select a category...";

  const options = document.createElement("div");
  options.className = "custom-options";
  options.id = "radar-options";

  selectWrapper.appendChild(trigger);
  selectWrapper.appendChild(options);
  innerDiv.appendChild(selectWrapper);

  rightDiv.appendChild(innerDiv);

  const saveBtn = document.createElement("button");
  saveBtn.id = "save-btn";
  saveBtn.textContent = "Save";
  rightDiv.appendChild(saveBtn);

  modal.appendChild(leftDiv);
  modal.appendChild(rightDiv);

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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    box-sizing: border-box;
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
  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.id = "new-cat-input";
  inputEl.placeholder = "Category name...";
  inputEl.style.cssText = "flex:1; background:#121212; border:1px solid #333; color:#eee; padding:8px; border-radius:6px; outline:none; font-size:13px; font-family:inherit;";

  const submitBtn = document.createElement("button");
  submitBtn.id = "new-cat-submit";
  submitBtn.style.cssText = "width:auto; padding:8px 12px; background:#2563eb; color:#fff; border-radius:6px; font-size:13px; cursor:pointer; border:none; transition:0.2s;";
  submitBtn.textContent = "Add";

  createCatWrapper.appendChild(inputEl);
  createCatWrapper.appendChild(submitBtn);

  createCatWrapper.onclick = (e) => e.stopPropagation();

  ['keydown', 'keyup', 'keypress'].forEach(evt => {
    inputEl.addEventListener(evt, (e) => e.stopPropagation());
  });

  const newCatBtn = document.createElement("div");
  newCatBtn.className = "custom-option";
  const strongBtn = document.createElement("strong");
  strongBtn.style.color = "#2563eb";
  strongBtn.textContent = "+ Create New Category";
  newCatBtn.appendChild(strongBtn);

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
      const serverUrl = await getServerUrl();
      const res = await fetch(`${serverUrl}/categories`, {
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
    if (inputEl) inputEl.value = "";
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
        } catch (e) { }
        return googleClickable.href;
      }
    }

    const directA = imgElement.closest('a[href*="imgres"]');
    if (directA) {
      try {
        const urlParams = new URLSearchParams(new URL(directA.href).search);
        const originalUrl = urlParams.get('imgrefurl');
        if (originalUrl) return originalUrl;
      } catch (e) { }
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
  if (!btn.classList.contains("active") || !btn.dataset.category) {
    showInlineMessage("⚠️ Please select a category first!", "#EF4444");
    return;
  }

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
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/add-image`, {
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
    chrome.runtime.sendMessage({ action: "SCAN_FOR_MORGIFILE" });
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
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/categories`);
    const data = await res.json();
    categoryCache = data.categories;
  } catch {
    chrome.runtime.sendMessage({ action: "SCAN_FOR_MORGIFILE" });
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
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/check-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    if (!data.exists) {
      const updated = list.filter((u) => u !== safeurl);
      chrome.storage.local.set({ savedImages: updated });
      return false;
    }
    return true;
  } catch {
    chrome.runtime.sendMessage({ action: "SCAN_FOR_MORGIFILE" });
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