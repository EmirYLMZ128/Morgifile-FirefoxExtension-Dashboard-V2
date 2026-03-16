// =====================
// STATE
// =====================
let images = [];
let activeCategory = "Tüm Görseller";
let categories = [];
let categoryCache = [];

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
// FETCH
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

let socket;

function initSocket() {
  socket = new WebSocket("ws://127.0.0.1:8000/ws");

  socket.onopen = () => {
    console.log("WS connected");
    if (typeof syncMissingImages === "function") syncMissingImages();
  };

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
        loadInitialData();
    }


    switch (data.type) {
      case "NEW_IMAGE":
      loadInitialData();
      break;
      case "CATEGORIES_UPDATED":
        categoryCache = data.payload;
        renderSidebarCategories(categoryCache);
        renderCategoryManageList(categoryCache);
        break;
      case "TRASH_EMPTIED": onTrashEmptied(); break;
      case "IMAGE_UPDATED": onImageUpdated(data.payload); break;
      case "IMAGE_REMOVED": onImageRemoved(data.payload.id); break;
      case "FAVORITE_TOGGLED": onFavoriteToggled(data.payload); break;
      case "IMAGE_TRASHED": onImageTrashed(data.payload); break;
      default: console.warn("Bilinmeyen WS mesajı:", data);
    }
  };

  socket.onerror = (err) => console.error("WS error:", err);
  socket.onclose = () => {
    console.warn("WS disconnected, reconnecting...");
    setTimeout(initSocket, 2000);
  };
}


// =====================
// WS HANDLERS
// =====================
function onFavoriteToggled(payload) {
  const img = images.find(i => i.id === payload.id);
  if (img) {
    img.isFavorite = payload.isFavorite;
    render();
  }
}

// ✅ Dışarıdan erişilebilir olması için global tanımla
async function loadInitialData() {
    const response = await fetch('http://127.0.0.1:8000/images');
    images = await response.json();
    render();
}

function onImageRemoved(id) {
  images = images.filter(img => img.id !== id);
  render();
}

function onImageTrashed(payload) {
  const img = images.find(i => i.id === payload.id);
  if (!img) return;
  img.isDeleted = true;
  render();
}

function onImageUpdated(payload) {
  const index = images.findIndex(i => i.id === payload.id);
  if (index === -1) return;
  images[index] = { ...images[index], ...payload };
  render();
}

function onTrashEmptied() {
  images = images.filter(img => !img.isDeleted);
  render();
}


// =====================
// RENDER
// =====================

async function syncMissingImages() {
  try {
    const res = await fetch("http://127.0.0.1:8000/images");
    const serverImages = await res.json();
    const existingIds = new Set(images.map(img => img.id));
    const missing = serverImages.filter(img => !existingIds.has(img.id));
    if (!missing.length) return;
    images = [...missing, ...images];
    render();
  } catch (e) {
    console.error("Sync failed", e);
  }
}


function renderSidebarCategories(categoryList) {
    const container = document.getElementById("sidebar-categories");
    if (!container) return;

    container.innerHTML = categoryList.map(cat => {
        const name = cat.name;
        
        if (name === "Uncategorized Favorites") {
            const hasImages = images.some(img => img.category === name && !img.isDeleted);
            if (!hasImages) return ""; 
        }

        // Aktiflik kontrolü
        const isActive = activeCategory === name ? "active" : "";
        
        return `
            <div class="nav-item ${isActive}" onclick="changeCategory('${name}')">
                <span class="cat-name">${name}</span>
            </div>
        `;
    }).join("");
}

function onNewImage(image) {
    console.log("📡 Yeni görsel geldi:", image);
    loadInitialData();
}

function render() {
  const grid = document.querySelector(".image-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const list = filterImages();
  updateHeaderActions();

  if (list.length) {
    grid.classList.add("active-grid");
    grid.insertAdjacentHTML("afterbegin", list.map(renderCard).join(""));
  } else {
    grid.classList.remove("active-grid");
    grid.innerHTML = emptyView();
  }
}

// =====================
// FILTER
// =====================
function filterImages() {
  return images.filter(img => {
    if (activeCategory === "Geri Dönüşüm") return img.isDeleted;
    if (img.isDeleted) return false;
    if (activeCategory === "Tüm Görseller") return true;
    if (activeCategory === "Favoriler") return img.isFavorite;
    return img.category === activeCategory;
  });
}


function updateHeaderActions() {
    const headerRight = document.querySelector(".header-right");
    if (!headerRight) return;

    // Sistem kategorileri (Düzenlenemez/Silinemez)
    const systemCats = [
      "Tüm Görseller",
      "Favoriler",
      "Geri Dönüşüm"
    ];

    const isSystem = systemCats.includes(activeCategory);

    let htmlButtons = "";


    // 2️⃣ GERİ DÖNÜŞÜM ÖZEL BUTONU (Meşale efekti için 'delete' stilini kullanabiliriz)
    if (activeCategory === "Geri Dönüşüm") {
        htmlButtons += `
            <button class="pill-btn danger" onclick="emptyTrash()">
                <i class="fas fa-fire"></i>
                <span>Geri dönüşüm kutusunu boşalt</span>
            </button>
        `;
    } 
    // 3️⃣ ÖZEL KATEGORİ BUTONLARI
    else if (!isSystem) {
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
    
    // Header-right'ın flex gap değerini CSS'den bağımsız kontrol etmek istersen:
    headerRight.style.display = "flex";
    headerRight.style.gap = "10px";
    headerRight.style.alignItems = "center";
}

async function emptyTrash() {
  // 1️⃣ Geri dönüşümde hiç görsel var mı?
  const trashCount = images.filter(img => img.isDeleted).length;

  if (trashCount === 0) {
    await AppSwal.fire({
      icon: 'info',
      title: 'Geri dönüşüm boş',
      text: 'Yakılacak herhangi bir görsel bulunmuyor.',
      timer: 2000,
      showConfirmButton: false
    });
    return;
  }

  // 2️⃣ Onay al
  const result = await AppSwal.fire({
    title: 'Emin misiniz?',
    text: `Geri dönüşüm kutusundaki ${trashCount} görsel yakılacak!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-fire"></i> Evet, yak gitsin!',
    cancelButtonText: 'Vazgeç',
    confirmButtonColor: '#ef4444'
  });

  // 3️⃣ Kullanıcı onayladıysa
  if (!result.isConfirmed) return;

  try {
    const response = await fetch(
      "http://127.0.0.1:8000/empty-trash",
      { method: "DELETE" }
    );

    if (!response.ok) throw new Error("Empty trash failed");

    // 4️⃣ Lokal state temizle
    images = images.filter(img => !img.isDeleted);
    render();

    // 5️⃣ Başarı bildirimi
    AppSwal.fire({
      title: 'Boşaltıldı!',
      text: `${trashCount} görsel kalıcı olarak silindi.`,
      icon: 'success',
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false
    });

  } catch (e) {
    console.error("Kutu boşaltma hatası:", e);

    AppSwal.fire({
      icon: 'error',
      title: 'Hata',
      text: 'İşlem sırasında bir sorun oluştu.'
    });
  }
}




function changeCategory(catName) {
    activeCategory = catName;

    // 1. Sidebar'ı tekrar render et (Bu hem statik hem dinamik listeyi kapsar)
    // Eğer statik menü (Tüm Görseller vb.) HTML içinde sabitse, onlara manuel class verelim:
    updateStaticNavActive(catName);
    
    // 2. Dinamik kategorileri render et
    renderSidebarCategories(categoryCache);

    // 3. Başlığı ve Grid'i güncelle
    const titleEl = document.getElementById("active-category-name");
    if (titleEl) titleEl.innerText = catName;

    render();
}

// Statik menü elemanlarını (HTML'de hazır olanlar) güncellemek için yardımcı fonksiyon
function updateStaticNavActive(catName) {
    document.querySelectorAll(".nav-menu .nav-item").forEach(item => {
        const itemName = item.innerText.trim();
        if (itemName === catName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}

function shouldRender(img) {
  if (activeCategory === "Geri Dönüşüm") return img.isDeleted;
  if (img.isDeleted) return false;

  if (activeCategory === "Tüm Görseller") return true;
  if (activeCategory === "Favoriler") return img.isFavorite;

  return img.category === activeCategory;
}



// =====================
// CARD (SADE)
// =====================
function renderCard(img) {
  const { src} = resolveSource(img);

  let actionButtons = '';

  // 🗑️ GERİ DÖNÜŞÜM KUTUSU
  if (img.isDeleted) {
    actionButtons = `
      <button
        class="card-btn permanent-delete-btn"
        onclick="permanentDelete(event, '${img.id}')"
        title="Kalıcı sil"
      >
        <i class="fas fa-fire"></i>
      </button>

      <button
        class="card-btn edit-btn"
        onclick="restoreImage(event, '${img.id}')"
        title="Geri yükle"
      >
        <i class="fas fa-undo"></i>
      </button>
    `;
  } 
  // 📁 NORMAL GÖRSELLER
  else {
    actionButtons = `
      <button
        class="card-btn fav-btn ${img.isFavorite ? 'active-fav' : ''}"
        onclick="toggleFavorite(event, '${img.id}')"
        title="Favori"
      >
        <i class="fas fa-star"></i>
      </button>

      ${
        !img.isFavorite
          ? `
          <button
            class="card-btn delete-btn"
            onclick="moveToTrash(event, '${img.id}')"
            title="Çöp kutusuna taşı"
          >
            <i class="fas fa-trash"></i>
          </button>
          `
          : ''
      }

      <button
        class="card-btn edit-btn"
        onclick="changeImageCategory(event, '${img.id}')"
        title="Kategori değiştir"
      >
        <i class="fas fa-undo"></i>
      </button>
    `;
  }

  return `
    <div 
      class="image-card"
      data-id="${img.id}"
      onclick="openImageDetail('${img.id}')"
    >
    <img
      src="${src}"
      loading="lazy"
      onerror="this.onerror=null; handleImageError(this,'${img.id}','${img.originalUrl}')"
    />

      <!-- SİYAH GRADIENT OVERLAY -->
      <div class="card-overlay">
        <div 
          class="card-actions"
          onclick="event.stopPropagation()"
        >
          ${actionButtons}
        </div>
      </div>
    </div>
  `;
}


async function moveToTrash(e, imageId) {
  // Eğer e varsa stopPropagation yap, yoksa (modalden geliyorsa) pas geç
    if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
    }

  try {
    const res = await fetch(`http://127.0.0.1:8000/images/${imageId}/trash`, {
      method: "PATCH"
    });

    if (!res.ok) throw new Error();

    // local state
    const img = images.find(i => i.id === imageId);
    if (img) img.isDeleted = true;

    render();
  } catch (err) {
    console.error("Çöpe taşıma hatası", err);
  }
}

async function toggleFavorite(e, imageId, isFromDetail = false) { // isFromDetail parametresi ekledik
    if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
    }

    try {
        const res = await fetch(`http://127.0.0.1:8000/images/toggle-favorite/${imageId}`, { method: "PATCH" });

        if (res.ok) {
            const data = await res.json();
            const img = images.find(i => i.id === imageId);
            if (img) {
                img.isFavorite = data.isFavorite;
                
                // Eğer detay modalındaysak butonları anında yenile (Sil gitsin/gelsin)
                if (isFromDetail) {
                    renderDetailActions(img);
                }
            }
            render(); // Arka plandaki grid'i de güncelle
        }
    } catch (err) {
        console.error("Favori hatası:", err);
    }
}

// =====================
// SOURCE LOGIC
// =====================

function resolveSource(img) {
  if (img.isSafe && img.SafePath) {
    return {
      src: `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(img.SafePath)}`
    };
  }

  if (img.ProxyUrl && img.proxyTried) {
    return { src: img.ProxyUrl };
  }

  return { src: img.originalUrl };
}


// =====================
// UI
// =====================
function bindNavigation() {
    const navMenu = document.querySelector(".nav-menu");

    navMenu.addEventListener("click", (e) => {
        const item = e.target.closest(".nav-item");
        if (!item) return;

        // İkonu değil sadece metni almak için .cat-name veya textContent kullanıyoruz
        const catName = item.querySelector(".cat-name") ? 
                        item.querySelector(".cat-name").innerText.trim() : 
                        item.innerText.trim();
        
        changeCategory(catName);
    });
}

// =====================
// HELPERS
// =====================
function emptyView() {
  return `
    <div class="empty-placeholder">
      <i class="fas fa-images"></i>
      <p>Bu kategoride görsel yok</p>
    </div>
  `;
}

async function handleImageError(imgEl, imageId, originalUrl) {
  const img = images.find(i => i.id === imageId);
  if (!img) return;

  // 🔒 sadece 1 kere
  if (img.proxyTried) return;
  img.proxyTried = true;

  img.ProxyUrl =
    `http://127.0.0.1:8000/proxy/image?url=${encodeURIComponent(originalUrl)}`;
  img.isCORS = true;

  render();
}





// =====================
// LOAD CATEGORIES (MODAL)
// =====================
async function loadCategoriesForModal() {
  try {
    const res = await fetch("http://127.0.0.1:8000/categories");
    const data = await res.json();

    const list = data.categories || [];
    renderCategoryManageList(list);
  } catch (e) {
    console.error("Kategori listesi alınamadı", e);
  }
}

function renderDetailActions(img) {
    const actionCont = document.querySelector(".action-btn-list");
    if (!actionCont) return;

    // Favori kontrolü: Eğer favori ise silme butonu boş string döner (gizlenir)
    const deleteBtnHtml = !img.isFavorite ? `
        <button class="action-btn delete" onclick="handleDetailDelete('${img.id}')" title="Çöpe Taşı">
            <i class="fas fa-trash"></i>
        </button>
    ` : '';

    actionCont.innerHTML = `
        <button class="action-btn fav-btn ${img.isFavorite ? 'active-fav' : ''}"  onclick="toggleFavorite(event, '${img.id}', true)">
            <i class="${img.isFavorite ? 'fas' : 'far'} fa-star"></i>
        </button>

        <button class="action-btn safe-btn ${img.isSafe ? 'active-safe' : ''}" onclick="${img.isSafe ? '' : `handleSafeArchive('${img.id}')`}" ${img.isSafe ? 'disabled' : ''} style="${img.isSafe ? 'cursor: default;' : ''}">
            <i class="fas fa-shield"></i>
        </button>

        <button class="action-btn edit" onclick="changeImageCategory(event, '${img.id}')">
            <i class="fas fa-undo"></i>
        </button>

        ${deleteBtnHtml}
    `;
}

// Detay modalı içinden silme işlemi
async function handleDetailDelete(imageId) {
    // 1. Onay al
    const result = await AppSwal.fire({
        title: 'Çöpe taşınsın mı?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger)',
        confirmButtonText: 'Evet, taşı'
    });

    if (result.isConfirmed) {
        // 2. Modalı hemen kapat
        document.getElementById("image-detail-modal").style.display = "none";
        
        // 3. Mevcut silme fonksiyonunu çalıştır
        moveToTrash(null, imageId); 
    }
}

// Favori tıklandığında butonları tekrar render et (Silme butonunun anlık gitmesi/gelmesi için)
// toggleFavorite fonksiyonun içine şu eklemeyi yapabilirsin:
function onFavoriteToggleSuccess(imgId) {
    const img = images.find(i => i.id === imgId);
    if (img && document.getElementById("image-detail-modal").style.display === "flex") {
        renderDetailActions(img);
    }
}

function renderCategoryManageList(list = []) {
    const container = document.getElementById("manage-cat-list");
    if (!container) return;

    // Sadece gerçek kategorileri filtrele (Özel favori kategorisini modalda asla gösterme)
    const filteredList = list.filter(cat => cat.name !== "Kategorize Edilmemiş Favoriler");

    if (filteredList.length === 0) {
        container.innerHTML = `<p class="empty-text">Düzenlenecek kategori bulunamadı</p>`;
        return;
    }

    container.innerHTML = filteredList.map(cat => `
        <div class="manage-cat-item">
            <span class="cat-name">${cat.name}</span>
            <div class="cat-actions">
                <button class="action-btn edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash-can"></i></button>
            </div>
        </div>
    `).join("");
}


async function changeImageCategory(e, imageId, restore = false) {
  e.stopPropagation();

  // SADECE normal kategorileri göster, özel favori kategorisini gizle
  const options = Object.fromEntries(
    categoryCache
      .filter(c => c.name !== "Kategorize Edilmemiş Favoriler")
      .map(c => [c.name, c.name])
  );

  const { value: selected } = await AppSwal.fire({
    title: restore ? 'Geri Yükle' : 'Kategori Değiştir',
    input: 'select',
    inputOptions: options,
    inputPlaceholder: 'Kategori seç',
    showCancelButton: true
  });

  if (!selected) return;

  // 🛠️ DÜZELTME: "const res =" kısmını ekledik!
  const res = await fetch("http://127.0.0.1:8000/images/change-category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: imageId,
      category: selected,
      restore
    })
  });

  if (res.ok) {
    // 1. Lokal state'i güncelle
    const img = images.find(i => i.id === imageId);
    if (img) {
      img.category = selected;
      if (restore) img.isDeleted = false;
    }

    // 2. UI YENİLEME: Sidebar ve Grid'i tazele
    // "Kategorize Edilmemiş Favoriler" boşaldıysa anında kaybolacaktır.
    renderSidebarCategories(categoryCache);
    render();
    
    // Opsiyonel: Başarı bildirimi
    AppSwal.fire({
        icon: 'success',
        title: 'Taşındı',
        timer: 1000,
        showConfirmButton: false
    });
  }
}

function openImageDetail(imageId) {
const img = images.find(i => i.id === imageId);
    if (!img) return;
    // 🛡️ KORUMA: Görsel yoksa veya silinmişse detayı açma
    if (!img || img.isDeleted) {
        console.log("Silinmiş görselin detayı açılamaz.");
        return;
    }

    const modal = document.getElementById("image-detail-modal");

    let finalSrc; // Resmin nihai adresini tutacak değişken

    if (img.isSafe && img.SafePath) {
        // 1. ÖNCELİK: Eğer kalkan aktifse ve yerel yol varsa
        // Tarayıcıya "Git bu dosyayı benim bilgisayarımdaki Python sunucusundan al" diyoruz.
        finalSrc = `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(img.SafePath)}`;

    } else if (img.isCORS  &&  img.ProxyUrl) {
        // 2. ÖNCELİK: Kalkan yok ama CORS (erişim) sorunu tespit edilmişse
        // "Bu resme direkt gidemiyoruz, Python aracı (Proxy) üzerinden getir" diyoruz.
        finalSrc = img.ProxyUrl;

    } else {
        // 3. ÖNCELİK: Hiçbir özel durum yoksa (Standart durum)
        // Resmin orijinal internet adresini kullanıyoruz.
        finalSrc = img.originalUrl;
    }
    
    // Temel Bilgiler
    document.getElementById("detail-img").src = finalSrc;
    document.getElementById("info-site").innerText = img.site || "Bilinmiyor";
    document.getElementById("info-url").href = img.originalUrl;
    document.getElementById("info-url").target = "_blank"; // Yeni sekme garantisi
    document.getElementById("info-category").innerText = img.category;
    document.getElementById("info-size").innerText = `${img.width || 0}px x ${img.height || 0}px`;
/*
    // Prompt Kontrolü
    // Prompt Butonu - Tıklandığında görseli yeni sekmede açar
    const promptCont = document.getElementById("prompt-btn");
    promptCont.innerHTML = `
        <button class="btn-ai-generate" onclick="window.open('https://Chat.openai.com/?q=${site}', '_blank')">
            <i class="fas fa-magic"></i> Prompt Üret
        </button>`;

    // Palette Butonu - Tıklandığında görseli yeni sekmede açar
    const paletteCont = document.getElementById("palette-btn");
    paletteCont.innerHTML = `
        <button class="btn-ai-generate" onclick="window.open('${img.originalUrl}', '_blank')">
            <i class="fas fa-palette"></i> Renk Paleti Üret 
        </button>`;
  */
    renderDetailActions(img);

    modal.style.display = "flex";
    modal.classList.add("active"); // Modal'ı açar
}

function closeDetailModal(e) {
    const modal = document.getElementById("image-detail-modal");
    // Eğer tıklanan yer modalın kendisi (overlay) ise kapat
    if (e.target === modal) {
        modal.style.display = "none";
    }
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
            const res = await fetch(`http://127.0.0.1:8000/images/permanent-delete/${id}`, { 
                method: "DELETE" 
            });
            
            if (res.ok) {
                images = images.filter(img => img.id !== id);
                render();
                AppSwal.fire('Silindi', 'Görsel her yerden temizlendi.', 'success');
            }
        } catch (err) {
            console.error("Silme hatası:", err);
        }
    }
}

// =====================
// CATEGORY MODAL
// =====================
function bindCategoryModal() {
  const openBtn = document.getElementById("open-category-modal");
  const modal = document.getElementById("modal-overlay");
  const closeBtn = document.getElementById("close-modal");

  if (!modal) return;

  // AÇ
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      modal.classList.add("active");
      loadCategoriesForModal(); // 👈 BURASI
    });
  }


  // KAPAT (X)
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  }

  // KAPAT (arka plana tıklayınca)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("active");
    }
  });
}

document.getElementById("create-cat-btn").addEventListener("click", async () => {
  const input = document.getElementById("new-cat-name");
  const name = input.value.trim();

  if (!name) return;

  // duplicate guard
// duplicate guard
if (categoryCache.some(c => c.name.toLowerCase() === name.toLowerCase())) {
  AppSwal.fire({
    icon: 'warning',
    title: 'Zaten Var',
    text: 'Bu kategori zaten mevcut'
  });
  return;
}



  try {
    const res = await fetch("http://127.0.0.1:8000/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!res.ok) throw new Error("Kategori eklenemedi");

    const newCat = await res.json();

    // 🧠 STATE UPDATE
    categoryCache.push(newCat);

    // 🎨 UI UPDATE
    renderCategoryManageList(categoryCache);
    renderSidebarCategories(categoryCache);

    input.value = "";
  } catch (e) {
    console.error(e);
  }
});


document.addEventListener("click", (e) => {
  const btn = e.target.closest(".action-btn.edit");
  if (!btn) return;

  const item = btn.closest(".manage-cat-item");
  
  // 🛡️ Guard: Eğer item bulunamazsa hata verme, dur.
  if (!item) {
    console.warn("Kategori öğesi (manage-cat-item) bulunamadı!");
    return;
  }

  const nameEl = item.querySelector(".cat-name");
  if (nameEl) {
    const oldName = nameEl.innerText.trim();
    editCategory(oldName);
  }
});
async function editCategory(oldName) {
  const { value: newName } = await AppSwal.fire({
    title: 'Kategori Düzenle',
    input: 'text',
    inputValue: oldName,
    inputPlaceholder: 'Yeni kategori adı',
    showCancelButton: true,
    confirmButtonText: 'Kaydet',
    cancelButtonText: 'Vazgeç',
    inputValidator: (value) => {
      if (!value) return 'Kategori adı boş olamaz';
    }
  });

  if (!newName || newName === oldName) return;

  const res = await fetch("http://127.0.0.1:8000/categories/rename", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      oldName,
      newName,
      merge: false
    })
  });

  const data = await res.json();

  // ⚠️ AYNI İSİM VARSA
  if (data.status === "conflict") {
    const confirmMerge = await AppSwal.fire({
      icon: 'warning',
      title: 'Kategori Zaten Var',
      text: `"${newName}" adlı kategori mevcut. Birleştirilsin mi?`,
      showCancelButton: true,
      confirmButtonText: 'Birleştir',
      cancelButtonText: 'İptal'
    });

    if (!confirmMerge.isConfirmed) return;

    // 🔥 MERGE ONAYLANDI
    const mergeRes = await fetch("http://127.0.0.1:8000/categories/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldName,
        newName,
        merge: true
      })
    });
    
    if(!mergeRes.ok) return;
  }

  // 🔄 UI & STATE UPDATE (Kritik Nokta)
  // Eğer şu an düzenlediğimiz kategori aktif olan kategoriyse, değişkeni de güncelleyelim
  if (activeCategory === oldName) {
      activeCategory = newName;
  }

  // Tüm verileri tazele (Sidebar, Grid, Modal Listesi)
  await refreshAll();

  // Header başlığını ve butonlarını anında güncelle
  const titleEl = document.getElementById("active-category-name");
  if (titleEl) titleEl.innerText = activeCategory;
  updateHeaderActions(); 

  AppSwal.fire({
    icon: 'success',
    title: 'Kategori güncellendi',
    timer: 1500,
    showConfirmButton: false
  });
}

document.addEventListener("click", (e) => {
  // 🎯 Sadece modal listesindeki SİL butonuna bak
  const deleteBtn = e.target.closest("#manage-cat-list .action-btn.delete");
  
  if (deleteBtn) {
    const item = deleteBtn.closest(".manage-cat-item");
    if (item) {
      const name = item.querySelector(".cat-name").innerText.trim();
      deleteCategory(name);
    }
    return; // İşlem tamamsa fonksiyondan çık
  }

  // 🎯 Sadece modal listesindeki DÜZENLE butonuna bak
  const editBtn = e.target.closest("#manage-cat-list .action-btn.edit");
  if (editBtn) {
    const item = editBtn.closest(".manage-cat-item");
    if (item) {
      const name = item.querySelector(".cat-name").innerText.trim();
      editCategory(name);
    }
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".action-btn.delete");
  if (!btn) return;

  const item = btn.closest(".manage-cat-item");
  
  // 🛡️ Eğer buton modal dışındaysa (Header'daysa) item null gelir.
  // Bu durumda querySelector çalıştırma ve sessizce çık.
  if (!item) return; 

  const nameEl = item.querySelector(".cat-name");
  if (nameEl) {
    deleteCategory(nameEl.innerText.trim());
  }
});


async function deleteCategory(name) {
// 🛡️ SADECE gerçek kategorileri say (Özel kategoriyi sayma)
  const realCategoryCount = categoryCache.filter(c => c.name !== "Kategorize Edilmemiş Favoriler").length;

  // Eğer 1 tane gerçek kategori kaldıysa silmeyi engelle
  if (realCategoryCount <= 1) {
    await AppSwal.fire({
      icon: 'error',
      title: 'İşlem Engellendi',
      text: 'Sistemde en az bir ana kategori bulunmalıdır. Son kategoriyi silemezsiniz.',
      confirmButtonText: 'Anladım'
    });
    return;
  }

  // 1️⃣ İlk deneme → Sadece kontrol (İçinde görsel var mı?)
  const res = await fetch("http://127.0.0.1:8000/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await res.json();

  // 🟢 GÖRSEL YOK → Direkt silindi
  if (data.status === "deleted") {
    changeCategory("Tüm Görseller"); // Sildiğimiz kategoride kalmamak için ana sayfaya dön
    await loadImages(); // Verileri tazele
    AppSwal.fire("Silindi", `"${name}" kategorisi başarıyla kaldırıldı.`, "success");
    return;
  }

  // 🟡 GÖRSEL VAR → Kullanıcıya seçenek sun
  const decision = await AppSwal.fire({
    icon: 'warning',
    title: `"${name}" Kategorisi Siliniyor`,
    text: `${data.count} görsel bulundu. Favori olanlar otomatik olarak korunacaktır. Ne yapmak istersiniz?`,
    showDenyButton: true,
    showCancelButton: true, // 👈 İPTAL BUTONU EKLENDİ
    confirmButtonText: 'Görselleri Sil',
    denyButtonText: 'Başka Yere Taşı',
    cancelButtonText: 'Vazgeç', // İptal metni
    confirmButtonColor: '#ef4444', // Silme için kırmızı
    denyButtonColor: '#6366f1',    // Taşıma için accent rengi
  });

  // ❌ İPTAL -> Kullanıcı vazgeçtiyse hiçbir şey yapma
  if (decision.isDismissed) return;

  // 🔥 EVET -> GÖRSELLERİ SİL
  if (decision.isConfirmed) {
    await fetch("http://127.0.0.1:8000/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        action: "delete_images"
      })
    });
    changeCategory("Tüm Görseller");
    await loadImages();
  }

  // 🔁 HAYIR -> TAŞI kısmındaki options filtresi
    if (decision.isDenied) {
    const options = categoryCache
      .map(c => c.name)
      .filter(c => c !== name && c !== "Kategorize Edilmemiş Favoriler"); // 👈 BURAYA EKLEDİK

    const { value: moveTo } = await AppSwal.fire({
      title: 'Nereye taşınsın?',
      input: 'select',
      inputOptions: Object.fromEntries(options.map(o => [o, o])),
      // ...
      inputPlaceholder: 'Hedef kategori seçin',
      showCancelButton: true,
      cancelButtonText: 'İptal'
    });

    if (!moveTo) return;

    await fetch("http://127.0.0.1:8000/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        action: "move_images",
        moveTo
      })
    });
    changeCategory(moveTo); // Görselleri taşıdığımız kategoriye git
    await loadImages();
  }
}

async function refreshAll() {
  // Paralel istek atarak hız kazanalım
  await Promise.all([
      loadImages(),          // Sidebar ve Grid'i günceller (içinde render var)
      loadCategoriesForModal() // Modal listesini günceller
  ]);
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
                <p style="color: #f87171; font-size: 0.8rem;">* Not: Dosya ismini değiştirmenize gerek yok, ben onu bulurum.</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'İndirdim, Onayla ✅',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#4f46e5',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
            try {
                const response = await fetch(`http://127.0.0.1:8000/images/${imageId}/verify-and-shield`, { method: 'POST' });
                const result = await response.json();
                
                if (!response.ok) throw new Error(result.detail || "Dosya bulunamadı");
                
                // ✅ BURASI ÖNEMLİ: Python tarafı başarılıysa modalı kapat
                return result; 
            } catch (error) {
                Swal.showValidationMessage(`Hata: ${error.message}`);
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // ✅ DETAY MODALINI KAPAT
            const detailModal = document.getElementById("image-detail-modal");
            if (detailModal) {
                detailModal.style.display = "none";
                detailModal.classList.remove("active");
            }

            AppSwal.fire({
                icon: 'success',
                title: 'Kalkan Aktif!',
                timer: 1500,
                showConfirmButton: false
            });

            // WebSocket zaten RELOAD_DATA gönderecek, 
            // ama garanti olsun dersen buraya da ekleyebilirsin:
            // window.location.reload(); 
        }
    });
}












// Doğrulama ve Taşıma İşlemi
async function processShieldValidation(imageId, img) {
    AppSwal.fire({ title: 'Kontrol ediliyor...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(`http://127.0.0.1:8000/images/${imageId}/verify-and-shield`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            img.isSafe = true;
            img.SafePath = data.safe_path;
            render(); // UI'ı güncelle (Artık yerelden okuyacak)
            AppSwal.fire('Başarılı!', 'Görsel yerel arşive taşındı.', 'success');
        } else {
            AppSwal.fire('Dosya Bulunamadı', 'İndirme klasöründe uygun görseli göremedim. Tekrar deneyin.', 'error');
        }
    } catch (e) {
        AppSwal.fire('Hata', 'Bağlantı sorunu oluştu.', 'error');
    }
}