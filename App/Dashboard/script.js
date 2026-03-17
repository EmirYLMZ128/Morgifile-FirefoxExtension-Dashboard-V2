// =====================
// STATE
// =====================
let images = [];
let activeCategory = "Tüm Görseller";
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
    console.error("Dashboard veri alınamadı", e);
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
        console.log("📡 WebSocket: Veriler güncelleniyor...");
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
    // Çöpteki çöpte kalır
    if (activeCategory === "Geri Dönüşüm") return img.isDeleted;
    if (img.isDeleted) return false;

    // MEZARLIK MANTIĞI: Eğer kategori Mezarlık ise sadece ölüleri göster
    if (activeCategory === "Mezarlık") return img.isDead;
    // Eğer görsel ölüyse ve biz Mezarlık'ta değilsek, onu diğer sayfalardan gizle
    if (img.isDead) return false;

    // Diğer normal filtreler
    if (activeCategory === "Tüm Görseller") return true;
    if (activeCategory === "Favoriler") return img.isFavorite;
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

    // 🛡️ GÜVENLİK DUVARI: Düzenlenemez ve Silinemez Kategoriler
    const systemCats = [
        "Tüm Görseller", 
        "Favoriler", 
        "Geri Dönüşüm", 
        "Uncategorized Favorites",
        "Graveyard"
    ];
    
    const isSystem = systemCats.includes(activeCategory);
    let htmlButtons = "";

    if (activeCategory === "Geri Dönüşüm") {
        htmlButtons += `
            <button class="pill-btn danger" onclick="emptyTrash()">
                <i class="fas fa-fire"></i>
                <span>Geri dönüşüm kutusunu boşalt</span>
            </button>
        `;
    } else if (!isSystem) { // 👈 EĞER SİSTEM KATEGORİSİ DEĞİLSE BUTONLARI GÖSTER
        htmlButtons += `
            <button class="action-btn tinder" onclick="toggleTinderMode()" title="Keşfet Modu">
              <i class="fas fa-fire"></i>
            </button>
            <button class="action-btn edit" onclick="editCategory('${activeCategory}')" title="Kategoriyi Düzenle">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete" onclick="deleteCategory('${activeCategory}')" title="Kategoriyi Sil">
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
      <button class="card-btn permanent-delete-btn" onclick="permanentDelete(event, '${img.id}')" title="Kalıcı sil">
        <i class="fas fa-fire"></i>
      </button>
      <button class="card-btn edit-btn" onclick="restoreImage(event, '${img.id}')" title="Geri yükle">
        <i class="fas fa-undo"></i>
      </button>
    `;
  } else {
    actionButtons = `
      <button class="card-btn fav-btn ${img.isFavorite ? 'active-fav' : ''}" onclick="toggleFavorite(event, '${img.id}')" title="Favori">
        <i class="fas fa-star"></i>
      </button>
      ${!img.isFavorite ? `
          <button class="card-btn delete-btn" onclick="moveToTrash(event, '${img.id}')" title="Çöp kutusuna taşı">
            <i class="fas fa-trash"></i>
          </button>
      ` : ''}
      <button class="card-btn edit-btn" onclick="changeImageCategory(event, '${img.id}')" title="Kategori değiştir">
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
  if (img.isSafe && img.SafePath) return { src: `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(img.SafePath)}` };
  if (img.ProxyUrl && img.proxyTried) return { src: img.ProxyUrl };
  return { src: img.originalUrl };
}

async function handleImageError(imgEl, imageId, originalUrl) {
  const img = images.find(i => i.id === imageId);
  if (!img) return;

  // EĞER PROXY ZATEN DENENMİŞSE VE YİNE HATA VERDİYSE -> GÖRSEL ÖLMÜŞTÜR (404)
  if (img.proxyTried) {
      if (!img.isDead) {
          img.isDead = true;
          // Sunucuya "Bu görsel öldü, mezara al" diyoruz
          fetch(`http://127.0.0.1:8000/images/${imageId}/mark-dead`, { method: 'PATCH' });
          render(); // Ekranı yenile ki mezarlığa gitsin
      }
      return;
  }
  
  // İLK HATA: CORS olabilir. Proxy'yi devreye sok.
  img.proxyTried = true;
  img.ProxyUrl = `http://127.0.0.1:8000/proxy/image?url=${encodeURIComponent(originalUrl)}`;
  img.isCORS = true;
  render();
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
    } catch (err) { console.error("Favori hatası:", err); }
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
    } catch (err) { console.error("Çöpe taşıma hatası", err); }
}

function restoreImage(e, id) {
  changeImageCategory(e, id, true);
}

async function permanentDelete(e, id) {
    if (e) e.stopPropagation();
    const confirm = await AppSwal.fire({
        title: 'Emin misiniz?',
        text: 'Bu görsel kalkan altında olsa bile kalıcı olarak silinecek ve diskten kaldırılacaktır!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Evet, Her Yerden Sil',
        confirmButtonColor: '#ef4444'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`http://127.0.0.1:8000/images/permanent-delete/${id}`, { method: "DELETE" });
            if (res.ok) {
                images = images.filter(img => img.id !== id);
                render();
                AppSwal.fire('Silindi', 'Görsel her yerden temizlendi.', 'success');
            }
        } catch (err) { console.error("Silme hatası:", err); }
    }
}

async function emptyTrash() {
  const trashCount = images.filter(img => img.isDeleted).length;
  if (trashCount === 0) {
    return AppSwal.fire({ icon: 'info', title: 'Boş', text: 'Yakılacak görsel yok.', timer: 2000, showConfirmButton: false });
  }

  const result = await AppSwal.fire({
    title: 'Emin misiniz?',
    text: `Geri dönüşüm kutusundaki ${trashCount} görsel yakılacak!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-fire"></i> Evet, yak gitsin!',
    confirmButtonColor: '#ef4444'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch("http://127.0.0.1:8000/empty-trash", { method: "DELETE" });
    if (res.ok) {
      images = images.filter(img => !img.isDeleted);
      render();
      AppSwal.fire({ title: 'Boşaltıldı!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  } catch (e) { console.error("Boşaltma hatası:", e); }
}

async function changeImageCategory(e, imageId, restore = false) {
  if(e) e.stopPropagation();
  const options = Object.fromEntries(
    categoryCache.filter(c => c.name !== "Kategorize Edilmemiş Favoriler" && c.name !== "Uncategorized Favorites").map(c => [c.name, c.name])
  );

  const { value: selected } = await AppSwal.fire({
    title: restore ? 'Geri Yükle' : 'Kategori Değiştir',
    input: 'select',
    inputOptions: options,
    inputPlaceholder: 'Kategori seç',
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
    AppSwal.fire({ icon: 'success', title: 'Taşındı', timer: 1000, showConfirmButton: false });
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
    document.getElementById("info-site").innerText = img.site || "Bilinmiyor";
    document.getElementById("info-url").href = img.originalUrl;
    document.getElementById("info-category").innerText = img.category;
    document.getElementById("info-size").innerText = `${img.width || 0}px x ${img.height || 0}px`;

    renderDetailActions(img);
    modal.style.display = "flex";
    modal.classList.add("active");
}

function closeDetailModal(e) {
    const modal = document.getElementById("image-detail-modal");
    if (e.target === modal) modal.style.display = "none";
}

function renderDetailActions(img) {
    const actionCont = document.querySelector(".action-btn-list");
    if (!actionCont) return;

    const deleteBtnHtml = !img.isFavorite ? `
        <button class="action-btn delete" onclick="handleDetailDelete('${img.id}')" title="Çöpe Taşı">
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
        title: 'Çöpe taşınsın mı?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger)',
        confirmButtonText: 'Evet, taşı'
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
        title: '<i class="fas fa-shield-alt" style="color:#6366f1"></i> Güvenli Arşiv',
        html: `
            <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                <p>🛡️ Görseli yerel arşivinize almak için:</p>
                <ol>
                    <li>Aşağıdaki linke tıkla ve görseli <b>İndirilenler</b> klasörüne kaydet.</li>
                    <div style="margin: 15px 0; background: #000; padding: 12px; border-radius: 8px; border: 1px solid #333;">
                        <a href="${img.originalUrl}" target="_blank" style="color: #4ade80; text-decoration: none; word-break: break-all; font-family: monospace;">
                            ${img.originalUrl}
                        </a>
                    </div>
                    <li>İndirme tamamlanınca aşağıdaki <b>Onayla</b> butonuna bas.</li>
                </ol>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'İndirdim, Onayla ✅',
        confirmButtonColor: '#4f46e5',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
            try {
                const response = await fetch(`http://127.0.0.1:8000/images/${imageId}/verify-and-shield`, { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || "Dosya bulunamadı");
                return result; 
            } catch (error) {
                Swal.showValidationMessage(`Hata: ${error.message}`);
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const detailModal = document.getElementById("image-detail-modal");
            if (detailModal) {
                detailModal.style.display = "none";
                detailModal.classList.remove("active");
            }
            AppSwal.fire({ icon: 'success', title: 'Kalkan Aktif!', timer: 1500, showConfirmButton: false });
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
    return AppSwal.fire({ icon: 'warning', title: 'Zaten Var', text: 'Bu kategori zaten mevcut' });
  }

  try {
    const res = await fetch("http://127.0.0.1:8000/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      // 🗑️ BURADAKİ categoryCache.push VE RENDER KODLARINI SİLDİK
      // Çünkü WebSocket (initSocket içindeki CATEGORIES_UPDATED) zaten ekranı yeniliyor!
      
      input.value = ""; // Sadece yazılan metni temizle
    }
  } catch (e) { console.error(e); }
});

function renderCategoryManageList(list = []) {
    const container = document.getElementById("manage-cat-list");
    if (!container) return;

    const filteredList = list.filter(cat => cat.name !== "Kategorize Edilmemiş Favoriler" && cat.name !== "Uncategorized Favorites");
    if (filteredList.length === 0) {
        container.innerHTML = `<p class="empty-text">Düzenlenecek kategori bulunamadı</p>`;
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
    title: 'Kategori Düzenle',
    input: 'text',
    inputValue: oldName,
    showCancelButton: true,
    confirmButtonText: 'Kaydet',
    inputValidator: (value) => { if (!value) return 'Boş olamaz'; }
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
      icon: 'warning', title: 'Zaten Var', text: `Birleştirilsin mi?`, showCancelButton: true, confirmButtonText: 'Birleştir'
    });
    if (!confirmMerge.isConfirmed) return;
    await fetch("http://127.0.0.1:8000/categories/rename", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldName, newName, merge: true })
    });
  }

  if (activeCategory === oldName) activeCategory = newName;
  await loadImages();
  AppSwal.fire({ icon: 'success', title: 'Güncellendi', timer: 1500, showConfirmButton: false });
}

async function deleteCategory(name) {
  const realCatCount = categoryCache.filter(c => c.name !== "Kategorize Edilmemiş Favoriler" && c.name !== "Uncategorized Favorites").length;
  if (realCatCount <= 1) return AppSwal.fire({ icon: 'error', title: 'Hata', text: 'Son kategoriyi silemezsiniz.' });

  const res = await fetch("http://127.0.0.1:8000/categories", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
  });
  const data = await res.json();

  if (data.status === "deleted") {
    changeCategory("Tüm Görseller");
    await loadImages();
    return AppSwal.fire("Silindi", "", "success");
  }

  const decision = await AppSwal.fire({
    icon: 'warning', title: `Siliniyor`, text: `${data.count} görsel bulundu. Favoriler korunur.`,
    showDenyButton: true, showCancelButton: true, confirmButtonText: 'Görselleri Sil', denyButtonText: 'Başka Yere Taşı'
  });

  if (decision.isDismissed) return;

  if (decision.isConfirmed) {
    await fetch("http://127.0.0.1:8000/categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, action: "delete_images" })
    });
    changeCategory("Tüm Görseller");
    await loadImages();
  }

  if (decision.isDenied) {
    const options = categoryCache.map(c => c.name).filter(c => c !== name && c !== "Kategorize Edilmemiş Favoriler" && c !== "Uncategorized Favorites");
    const { value: moveTo } = await AppSwal.fire({
      title: 'Nereye taşınsın?', input: 'select', inputOptions: Object.fromEntries(options.map(o => [o, o])), showCancelButton: true
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
      <p>Bu kategoride görsel yok</p>
    </div>
  `;
}