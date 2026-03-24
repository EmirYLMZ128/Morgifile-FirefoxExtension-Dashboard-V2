// =====================
// STATE
// =====================
let images = [];
let activeCategory = "All Images";
let categoryCache = [];
let socket;

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  loadImages();
  bindNavigation();
  initSocket();
  bindCategoryModal();
});

const AppSwal = Swal.mixin({
  background: '#1a1a1a',
  color: '#ffffff',
  confirmButtonColor: '#6366f1',
  cancelButtonColor: '#4b5563',
  customClass: {
    popup: 'my-swal-popup',
    title: 'my-swal-title',
    input: 'my-swal-select',
    confirmButton: 'my-swal-confirm',
    cancelButton: 'my-swal-cancel'
  }
});

// =====================
// FETCH & SOCKET
// =====================
async function loadImages() {
  try {
    const [imgRes, catRes] = await Promise.all([
      fetch("http://127.0.0.1:8000/images"),
      fetch("http://127.0.0.1:8000/categories")
    ]);
    images = await imgRes.json();
    const catData = await catRes.json();
    categoryCache = Array.isArray(catData.categories) ? catData.categories : [];
    
    renderSidebarCategories(categoryCache);
    renderCategoryManageList(categoryCache);
    render();
  } catch (e) {
    console.error("Dashboard data could not be fetched", e);
  }
}

async function loadInitialData() {
    const response = await fetch('http://127.0.0.1:8000/images');
    images = await response.json();
    render();
}

function initSocket() {
  socket = new WebSocket("ws://127.0.0.1:8000/ws");

  socket.onopen = () => console.log("✅ WS connected");

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "RELOAD_DATA") {
        console.log("📡 WebSocket: Updating data...");
        const modal = document.getElementById("image-detail-modal");
        if(modal) {
            modal.style.display = "none";
            modal.classList.remove("active");
        }
        window.location.reload();
    }

    switch (data.type) {
      case "NEW_IMAGE": loadInitialData(); break;
      case "CATEGORIES_UPDATED":
        categoryCache = data.payload;
        renderSidebarCategories(categoryCache);
        renderCategoryManageList(categoryCache);
        break;
      case "TRASH_EMPTIED": 
        images = images.filter(img => !img.isDeleted);
        render(); 
        break;
      case "IMAGE_UPDATED": 
        updateLocalImage(data.payload); 
        break;
      case "FAVORITE_TOGGLED": 
        updateLocalImage({ id: data.payload.id, isFavorite: data.payload.isFavorite }); 
        break;
      case "IMAGE_TRASHED": 
        updateLocalImage({ id: data.payload.id, isDeleted: true }); 
        break;
    }
  };

  socket.onerror = (err) => console.error("WS error:", err);
  socket.onclose = () => {
    console.warn("WS disconnected, reconnecting...");
    setTimeout(initSocket, 2000);
  };
}

function updateLocalImage(payload) {
  const img = images.find(i => i.id === payload.id);
  if (img) {
    Object.assign(img, payload);
    render();
  }
}

// =====================
// RENDER & FILTER
// =====================
function render() {
  const grid = document.querySelector(".image-grid");
  if (!grid) return;
  grid.innerHTML = "";
  
  const list = images.filter(img => {
    // What's in the trash stays in the trash
    if (activeCategory === "Trash") return img.isDeleted;
    if (img.isDeleted) return false;

    // GRAVEYARD LOGIC: If category is Graveyard, show only dead images
    if (activeCategory === "Graveyard") return img.isDead;
    // If the image is dead and we are not in Graveyard, hide it from other pages
    if (img.isDead) return false;

    // Other normal filters
    if (activeCategory === "All Images") return true;
    if (activeCategory === "Favorites") return img.isFavorite;
    return img.category === activeCategory;
  });

  updateHeaderActions();

  if (list.length) {
    grid.classList.add("active-grid");
    grid.insertAdjacentHTML("afterbegin", list.map(renderCard).join(""));
  } else {
    grid.classList.remove("active-grid");
    grid.innerHTML = emptyView();
  }
}

function renderSidebarCategories(categoryList) {
    const container = document.getElementById("sidebar-categories");
    if (!container) return;

    container.innerHTML = categoryList.map(cat => {
        const name = cat.name;
        if (name === "Kategorize Edilmemiş Favoriler" || name === "Uncategorized Favorites") {
            const hasImages = images.some(img => img.category === name && !img.isDeleted);
            if (!hasImages) return ""; 
        }

        const isActive = activeCategory === name ? "active" : "";
        return `
            <div class="nav-item ${isActive}" onclick="changeCategory('${name}')">
                <span class="cat-name">${name}</span>
            </div>
        `;
    }).join("");
}

function updateHeaderActions() {
    const headerRight = document.querySelector(".header-right");
    if (!headerRight) return;

    // 🛡️ SECURITY WALL: Buttons are hidden in these categories!
    const systemCats = [
        "All Images", 
        "Favorites", 
        "Trash", 
        "Uncategorized Favorites", 
        "Kategorize Edilmemiş Favoriler", // For backwards compatibility
        "Graveyard" // 👈 MAKE SURE THIS IS HERE
    ];
    
    const isSystem = systemCats.includes(activeCategory);
    let htmlButtons = "";

    if (activeCategory === "Trash") {
        htmlButtons += `
            <button class="pill-btn danger" onclick="emptyTrash()">
                <i class="fas fa-fire"></i>
                <span>Empty trash bin</span>
            </button>
        `;
    } else if (!isSystem) { 
        // IF NOT A SYSTEM CATEGORY, RENDER NORMAL BUTTONS
        htmlButtons += `
            <button class="action-btn tinder" onclick="toggleTinderMode()" title="Discover Mode">
              <i class="fas fa-fire"></i>
            </button>
            <button class="action-btn edit" onclick="editCategory('${activeCategory}')" title="Edit Category">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete" onclick="deleteCategory('${activeCategory}')" title="Delete Category">
                <i class="fas fa-trash-can"></i>
            </button>
        `;
    }

    headerRight.innerHTML = htmlButtons;
    headerRight.style.display = "flex";
    headerRight.style.gap = "10px";
    headerRight.style.alignItems = "center";
}

function changeCategory(catName) {
    activeCategory = catName;
    document.querySelectorAll(".nav-menu .nav-item").forEach(item => {
        const itemName = item.innerText.trim();
        item.classList.toggle("active", itemName === catName);
    });
    
    renderSidebarCategories(categoryCache);
    const titleEl = document.getElementById("active-category-name");
    if (titleEl) titleEl.innerText = catName;
    render();
}

// =====================
// CARD COMPONENTS
// =====================
function renderCard(img) {
  const { src } = resolveSource(img);
  let actionButtons = '';

  if (img.isDeleted) {
    actionButtons = `
      <button class="card-btn permanent-delete-btn" onclick="permanentDelete(event, '${img.id}')" title="Delete permanently">
        <i class="fas fa-fire"></i>
      </button>
      <button class="card-btn edit-btn" onclick="restoreImage(event, '${img.id}')" title="Restore">
        <i class="fas fa-undo"></i>
      </button>
    `;
  } else {
    actionButtons = `
      <button class="card-btn fav-btn ${img.isFavorite ? 'active-fav' : ''}" onclick="toggleFavorite(event, '${img.id}')" title="Favorite">
        <i class="fas fa-star"></i>
      </button>
      ${!img.isFavorite ? `
          <button class="card-btn delete-btn" onclick="moveToTrash(event, '${img.id}')" title="Move to trash">
            <i class="fas fa-trash"></i>
          </button>
      ` : ''}
      <button class="card-btn edit-btn" onclick="changeImageCategory(event, '${img.id}')" title="Change category">
        <i class="fas fa-folder-open"></i>
      </button>
    `;
  }

  return `
    <div class="image-card" data-id="${img.id}" onclick="openImageDetail('${img.id}')">
    <img src="${src}" loading="lazy" onerror="this.onerror=null; handleImageError(this,'${img.id}','${img.originalUrl}')" />
      <div class="card-overlay">
        <div class="card-actions" onclick="event.stopPropagation()">
          ${actionButtons}
        </div>
      </div>
    </div>
  `;
}

function resolveSource(img) {
  // 1. PRIORITY: If shield is active (Local File)
  if (img.isSafe && img.SafePath) {
      return { src: `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(img.SafePath)}` };
  }
  
  // 2. PRIORITY: If Proxy is saved in DB (isCORS=1) or it failed and fell to proxy just now (proxyTried)
  if ((img.isCORS && img.ProxyUrl) || (img.ProxyUrl && img.proxyTried)) {
      return { src: img.ProxyUrl };
  }
  
  // 3. PRIORITY: Clean images with no issues
  return { src: img.originalUrl };
}

async function handleImageError(imgEl, imageId, originalUrl) {
  const img = images.find(i => i.id === imageId);
  if (!img) return;

  // 1. IF PROXY WAS ALREADY TRIED AND FAILED AGAIN -> MOVE TO GRAVEYARD
  if (img.proxyTried) {
      if (!img.isDead) {
          img.isDead = true;
          fetch(`http://127.0.0.1:8000/images/${imageId}/mark-dead`, { method: 'PATCH' });
          render(); 
      }
      return;
  }
  
  // 2. FIRST ERROR: Might be CORS. Activate Proxy.
  img.proxyTried = true;
  img.ProxyUrl = `http://127.0.0.1:8000/proxy/image?url=${encodeURIComponent(originalUrl)}`;
  img.isCORS = true;
  render(); // Fix the screen immediately so user doesn't see a broken image

  // 🚀 MISSING PART: Save status to database!
  try {
      await fetch(`http://127.0.0.1:8000/images/${imageId}/proxy-enable`, { 
          method: 'POST' 
      });
      console.log(`Image ${imageId} updated with Proxy in database.`);
  } catch (err) {
      console.error("Failed to write Proxy status to database:", err);
  }
}

// =====================
// IMAGE ACTIONS
// =====================
async function toggleFavorite(e, imageId, isFromDetail = false) {
    if (e) e.stopPropagation();
    try {
        const res = await fetch(`http://127.0.0.1:8000/images/toggle-favorite/${imageId}`, { method: "PATCH" });
        if (res.ok) {
            const data = await res.json();
            const img = images.find(i => i.id === imageId);
            if (img) {
                img.isFavorite = data.isFavorite;
                if (isFromDetail) renderDetailActions(img);
                render(); 
            }
        }
    } catch (err) { console.error("Favorite error:", err); }
}

async function moveToTrash(e, imageId) {
    if (e) e.stopPropagation();
    try {
        const res = await fetch(`http://127.0.0.1:8000/images/${imageId}/trash`, { method: "PATCH" });
        if (res.ok) {
            const img = images.find(i => i.id === imageId);
            if (img) img.isDeleted = true;
            render();
        }
    } catch (err) { console.error("Move to trash error:", err); }
}

function restoreImage(e, id) {
  changeImageCategory(e, id, true);
}

async function permanentDelete(e, id) {
    if (e) e.stopPropagation();
    const confirm = await AppSwal.fire({
        title: 'Are you sure?',
        text: 'This image will be permanently deleted and removed from the disk, even if it is under the shield!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Delete Everywhere',
        confirmButtonColor: '#ef4444'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`http://127.0.0.1:8000/images/permanent-delete/${id}`, { method: "DELETE" });
            if (res.ok) {
                images = images.filter(img => img.id !== id);
                render();
                AppSwal.fire('Deleted', 'Image cleared from everywhere.', 'success');
            }
        } catch (err) { console.error("Delete error:", err); }
    }
}

async function emptyTrash() {
  const trashCount = images.filter(img => img.isDeleted).length;
  if (trashCount === 0) {
    return AppSwal.fire({ icon: 'info', title: 'Empty', text: 'No images to burn.', timer: 2000, showConfirmButton: false });
  }

  const result = await AppSwal.fire({
    title: 'Are you sure?',
    text: `${trashCount} images in the trash bin will be burned!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-fire"></i> Yes, burn it!',
    confirmButtonColor: '#ef4444'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch("http://127.0.0.1:8000/empty-trash", { method: "DELETE" });
    if (res.ok) {
      images = images.filter(img => !img.isDeleted);
      render();
      AppSwal.fire({ title: 'Emptied!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  } catch (e) { console.error("Empty trash error:", e); }
}

async function changeImageCategory(e, imageId, restore = false) {
  if(e) e.stopPropagation();
  const options = Object.fromEntries(
    categoryCache.filter(c => c.name !== "Kategorize Edilmemiş Favoriler" && c.name !== "Uncategorized Favorites").map(c => [c.name, c.name])
  );

  const { value: selected } = await AppSwal.fire({
    title: restore ? 'Restore' : 'Change Category',
    input: 'select',
    inputOptions: options,
    inputPlaceholder: 'Select category',
    showCancelButton: true
  });

  if (!selected) return;

  const res = await fetch("http://127.0.0.1:8000/images/change-category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: imageId, category: selected, restore })
  });

  if (res.ok) {
    const img = images.find(i => i.id === imageId);
    if (img) {
      img.category = selected;
      if (restore) img.isDeleted = false;
    }
    renderSidebarCategories(categoryCache);
    render();
    AppSwal.fire({ icon: 'success', title: 'Moved', timer: 1000, showConfirmButton: false });
  }
}

// =====================
// DETAIL MODAL & SHIELD
// =====================
function openImageDetail(imageId) {
    const img = images.find(i => i.id === imageId);
    if (!img || img.isDeleted) return;

    const modal = document.getElementById("image-detail-modal");
    let finalSrc = img.originalUrl;
    if (img.isSafe && img.SafePath) finalSrc = `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(img.SafePath)}`;
    else if (img.isCORS && img.ProxyUrl) finalSrc = img.ProxyUrl;

    document.getElementById("detail-img").src = finalSrc;
    document.getElementById("info-site").innerText = img.site || "Unknown";
    document.getElementById("info-url").href = img.originalUrl;
    document.getElementById("info-category").innerText = img.category;
    document.getElementById("info-size").innerText = `${img.width || 0}px x ${img.height || 0}px`;

    renderDetailActions(img);
    renderAITools(img); 
    
    modal.style.display = "flex";
    modal.classList.add("active");
}

// 🤖 Function Rendering AI and Search Engine Buttons
function renderAITools(img) {
    const promptCont = document.getElementById("prompt-btn");
    const paletteCont = document.getElementById("palette-btn");
    const searchCont = document.getElementById("search-btn"); 

    const safeUrl = encodeURIComponent(img.originalUrl);

    // 1. PROMPT BUTTON (Gray / Disabled)
    if (promptCont) {
        promptCont.innerHTML = `
            <button class="outline-btn disabled" onclick="showComingSoon('AI Prompt Engine 🤖')" title="Coming Soon!">
                <i class="fas fa-robot"></i> Generate Prompt
            </button>
        `;
    }

    // 2. COLOR PALETTE BUTTON (Gray / Disabled)
    if (paletteCont) {
        paletteCont.innerHTML = `
            <button class="outline-btn disabled" onclick="showComingSoon('Color Palette Engine 🎨')" title="Coming Soon!">
                <i class="fas fa-palette"></i> Extract Color
            </button>
        `;
    }

    // 3. SEARCH ENGINE BUTTONS
    if (searchCont) {
        searchCont.innerHTML = `
            <button class="outline-btn" onclick="window.open('https://lens.google.com/uploadbyurl?url=${safeUrl}', '_blank')" title="Search on Google Lens">
                <i class="fas fa-search"></i> Lens
            </button>
            <button class="outline-btn" onclick="window.open('https://yandex.com/images/search?rpt=imageview&url=${safeUrl}', '_blank')" title="Find similar on Yandex">
                <i class="fab fa-yandex-international"></i> Yandex
            </button>
            <button class="outline-btn" onclick="window.open('https://tineye.com/search?url=${safeUrl}', '_blank')" title="Find source with TinEye">
                <i class="fas fa-eye"></i> TinEye
            </button>
        `;
    }
}

// 🎨 Color Palette
/*async function extractColorPalette(imageId) {
    const img = images.find(i => i.id === imageId);
    if (!img) return;

    try {
        // 1. Secretly copy the image link to the clipboard
        await navigator.clipboard.writeText(img.originalUrl);
        
        // 2. Tell the user what to do and confirm
        AppSwal.fire({
            icon: 'success',
            title: 'Link Copied! 🎨',
            text: 'I copied the image link to your clipboard. Now you can easily extract colors by clicking the "Website URL" section on the ImageColorPicker site that will open and using CTRL+V (Paste).',
            confirmButtonText: 'Go to Site 🚀',
            confirmButtonColor: '#6366f1'
        }).then((result) => {
            if (result.isConfirmed) {
                window.open('https://imagecolorpicker.com/en', '_blank');
            }
        });
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        // Open the site anyway even if copying is blocked
        window.open('https://imagecolorpicker.com/en', '_blank');
    }
}*/

// 🚀 Common Warning for Features Under Development
function showComingSoon(featureName) {
    AppSwal.fire({
        icon: 'info',
        title: featureName,
        text: 'This feature is currently under development! With the Vue.js (V3) update, it will be integrated directly into the system without needing external services. Stay tuned! 😎',
        confirmButtonText: 'Can\'t wait 🚀',
        confirmButtonColor: '#6366f1'
    });
}

// 🤖 Manual Image Upload Redirection for ChatGPT
/*async function openChatGPTForPrompt(imageId) {
    const img = images.find(i => i.id === imageId);
    if (!img) return;

    await AppSwal.fire({
        icon: 'info',
        title: 'AI Wall 🧱',
        html: `
            <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                ChatGPT cannot read external links due to firewalls. But we have a trick:<br><br>
                <b>1.</b> Right-click on the image behind this and select <b>Copy Image</b>.<br>
                <b>2.</b> Open ChatGPT by clicking the button below.<br>
                <b>3.</b> Press <b>CTRL + V</b> in the message box to paste the image and hit Enter!
            </div>
        `,
        confirmButtonText: "Got it, Open ChatGPT 🚀",
        confirmButtonColor: '#6366f1'
    });

    // Opening ChatGPT with a ready prompt
    const promptText = "Please analyze the style, color palette, composition, and lighting of this image in detail. Then, write a professional, high-quality English prompt for me so I can recreate this image in an AI tool like Midjourney or Adobe Firefly.";
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(promptText)}`, '_blank');
}
*/
function closeDetailModal(e) {
    const modal = document.getElementById("image-detail-modal");
    if (e.target === modal) modal.style.display = "none";
}

function renderDetailActions(img) {
    const actionCont = document.querySelector(".action-btn-list");
    if (!actionCont) return;

    const deleteBtnHtml = !img.isFavorite ? `
        <button class="action-btn delete" onclick="handleDetailDelete('${img.id}')" title="Move to Trash">
            <i class="fas fa-trash"></i>
        </button>
    ` : '';

    actionCont.innerHTML = `
        <button class="action-btn fav-btn ${img.isFavorite ? 'active-fav' : ''}" onclick="toggleFavorite(event, '${img.id}', true)">
            <i class="${img.isFavorite ? 'fas' : 'far'} fa-star"></i>
        </button>
        <button class="action-btn safe-btn ${img.isSafe ? 'active-safe' : ''}" onclick="${img.isSafe ? '' : `handleSafeArchive('${img.id}')`}" ${img.isSafe ? 'disabled' : ''} style="${img.isSafe ? 'cursor: default;' : ''}">
            <i class="fas fa-shield"></i>
        </button>
        <button class="action-btn edit" onclick="changeImageCategory(event, '${img.id}')">
            <i class="fas fa-folder-open"></i>
        </button>
        ${deleteBtnHtml}
    `;
}

async function handleDetailDelete(imageId) {
    const result = await AppSwal.fire({
        title: 'Move to trash?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger)',
        confirmButtonText: 'Yes, move'
    });

    if (result.isConfirmed) {
        document.getElementById("image-detail-modal").style.display = "none";
        moveToTrash(null, imageId); 
    }
}

async function handleSafeArchive(imageId) {
    const img = images.find(i => i.id === imageId);
    if (!img) return;

    await AppSwal.fire({
        title: '<i class="fas fa-shield-alt" style="color:#6366f1"></i> Safe Archive',
        html: `
            <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                <p>🛡️ To save the image to your local archive:</p>
                <ol>
                    <li>Click the link below and save the image to your <b>Downloads</b> folder.</li>
                    <div style="margin: 15px 0; background: #000; padding: 12px; border-radius: 8px; border: 1px solid #333;">
                        <a href="${img.originalUrl}" target="_blank" style="color: #4ade80; text-decoration: none; word-break: break-all; font-family: monospace;">
                            ${img.originalUrl}
                        </a>
                    </div>
                    <li>Once downloaded, click the <b>Confirm</b> button below.</li>
                </ol>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Downloaded, Confirm ✅',
        confirmButtonColor: '#4f46e5',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
            try {
                const response = await fetch(`http://127.0.0.1:8000/images/${imageId}/verify-and-shield`, { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || "File not found");
                return result; 
            } catch (error) {
                Swal.showValidationMessage(`Error: ${error.message}`);
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const detailModal = document.getElementById("image-detail-modal");
            if (detailModal) {
                detailModal.style.display = "none";
                detailModal.classList.remove("active");
            }
            AppSwal.fire({ icon: 'success', title: 'Shield Active!', timer: 1500, showConfirmButton: false });
        }
    });
}

// =====================
// CATEGORY MANAGEMENT
// =====================
function bindCategoryModal() {
  const openBtn = document.getElementById("open-category-modal");
  const modal = document.getElementById("modal-overlay");
  const closeBtn = document.getElementById("close-modal");

  if (!modal) return;

  if (openBtn) openBtn.addEventListener("click", () => {
      modal.classList.add("active");
      renderCategoryManageList(categoryCache);
  });
  if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });
}

document.getElementById("create-cat-btn")?.addEventListener("click", async () => {
  const input = document.getElementById("new-cat-name");
  const name = input.value.trim();
  if (!name) return;

  if (categoryCache.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return AppSwal.fire({ icon: 'warning', title: 'Already Exists', text: 'This category already exists' });
  }

  try {
    const res = await fetch("http://127.0.0.1:8000/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      // 🗑️ DELETED categoryCache.push AND RENDER CODES HERE
      // Because WebSocket (CATEGORIES_UPDATED in initSocket) already refreshes the screen!
      
      input.value = ""; // Only clear the typed text
    }
  } catch (e) { console.error(e); }
});

function renderCategoryManageList(list = []) {
    const container = document.getElementById("manage-cat-list");
    if (!container) return;

    const filteredList = list.filter(cat => cat.name !== "Kategorize Edilmemiş Favoriler" && cat.name !== "Uncategorized Favorites");
    if (filteredList.length === 0) {
        container.innerHTML = `<p class="empty-text">No categories found to manage</p>`;
        return;
    }

    container.innerHTML = filteredList.map(cat => `
        <div class="manage-cat-item">
            <span class="cat-name">${cat.name}</span>
            <div class="cat-actions">
                <button class="action-btn edit" onclick="editCategory('${cat.name}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" onclick="deleteCategory('${cat.name}')"><i class="fas fa-trash-can"></i></button>
            </div>
        </div>
    `).join("");
}

async function editCategory(oldName) {
  const { value: newName } = await AppSwal.fire({
    title: 'Edit Category',
    input: 'text',
    inputValue: oldName,
    showCancelButton: true,
    confirmButtonText: 'Save',
    inputValidator: (value) => { if (!value) return 'Cannot be empty'; }
  });

  if (!newName || newName === oldName) return;

  const res = await fetch("http://127.0.0.1:8000/categories/rename", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldName, newName, merge: false })
  });
  const data = await res.json();

  if (data.status === "conflict") {
    const confirmMerge = await AppSwal.fire({
      icon: 'warning', title: 'Already Exists', text: `Merge?`, showCancelButton: true, confirmButtonText: 'Merge'
    });
    if (!confirmMerge.isConfirmed) return;
    await fetch("http://127.0.0.1:8000/categories/rename", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldName, newName, merge: true })
    });
  }

  if (activeCategory === oldName) activeCategory = newName;
  await loadImages();
  AppSwal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
}

async function deleteCategory(name) {
  const realCatCount = categoryCache.filter(c => c.name !== "Kategorize Edilmemiş Favoriler" && c.name !== "Uncategorized Favorites").length;
  if (realCatCount <= 1) return AppSwal.fire({ icon: 'error', title: 'Error', text: 'You cannot delete the last category.' });

  const res = await fetch("http://127.0.0.1:8000/categories", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
  });
  const data = await res.json();

  if (data.status === "deleted") {
    changeCategory("All Images");
    await loadImages();
    return AppSwal.fire("Deleted", "", "success");
  }

  const decision = await AppSwal.fire({
    icon: 'warning', title: `Deleting`, text: `${data.count} images found. Favorites are kept.`,
    showDenyButton: true, showCancelButton: true, confirmButtonText: 'Delete Images', denyButtonText: 'Move Elsewhere'
  });

  if (decision.isDismissed) return;

  if (decision.isConfirmed) {
    await fetch("http://127.0.0.1:8000/categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, action: "delete_images" })
    });
    changeCategory("All Images");
    await loadImages();
  }

  if (decision.isDenied) {
    const options = categoryCache.map(c => c.name).filter(c => c !== name && c !== "Kategorize Edilmemiş Favoriler" && c !== "Uncategorized Favorites");
    const { value: moveTo } = await AppSwal.fire({
      title: 'Move where?', input: 'select', inputOptions: Object.fromEntries(options.map(o => [o, o])), showCancelButton: true
    });
    if (!moveTo) return;

    await fetch("http://127.0.0.1:8000/categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, action: "move_images", moveTo })
    });
    changeCategory(moveTo);
    await loadImages();
  }
}

// =====================
// UTILS
// =====================
function bindNavigation() {
    const navMenu = document.querySelector(".nav-menu");
    navMenu.addEventListener("click", (e) => {
        const item = e.target.closest(".nav-item");
        if (!item) return;
        const catName = item.querySelector(".cat-name") ? item.querySelector(".cat-name").innerText.trim() : item.innerText.trim();
        changeCategory(catName);
    });
}

function emptyView() {
  return `
    <div class="empty-placeholder">
      <i class="fas fa-images"></i>
      <p>No images in this category</p>
    </div>
  `;
}