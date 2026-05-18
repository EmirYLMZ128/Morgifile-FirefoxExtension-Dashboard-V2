<template>
  <div class="app-container flex w-screen h-screen overflow-hidden transition-colors duration-300" 
       :class="store.isDarkMode ? 'text-[#f8fafc] bg-[#0f172a]' : 'text-[#1f2937] bg-[#f5f5f7]'">
    <Sidebar @openManageCategories="isCatModalVisible = true" />

    <main class="content flex flex-col flex-grow h-screen overflow-hidden">
      <Header 
        @emptyTrash="emptyTrash" 
        @renameCategory="renameCategory" 
        @deleteCategory="deleteCategory" 
      />

      <ImageGrid 
        @selectImage="openDetailModal"
        @permanentDelete="permanentDelete"
        @restoreImage="restoreImage"
        @moveToTrash="moveToTrash"
        @toggleFavorite="toggleFavorite"
        @changeCategory="changeImageCategory"
        @markDead="markImageDead"
      />
    </main>

    <CategoryManageModal 
      :isVisible="isCatModalVisible"
      @close="isCatModalVisible = false"
      @createCategory="createCategory"
      @renameCategory="renameCatFromModal"
      @deleteCategory="deleteCategory"
    />

    <ImageDetailModal 
      v-if="selectedImage"
      :isVisible="isDetailModalVisible"
      :img="selectedImage"
      @close="closeDetailModal"
      @showComingSoon="showComingSoon"
      @moveToTrash="moveToTrashDetail"
      @toggleFavorite="toggleFavDetail"
      @changeCategory="changeCategoryDetail"
      @handleSafeArchive="handleSafeArchive"
      @navigate="navigateImage"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { store, initStore, filteredImages, BASE_URL } from '@/store';
import Swal from 'sweetalert2';

import Sidebar from '@/components/layout/Sidebar.vue';
import Header from '@/components/layout/Header.vue';
import ImageGrid from '@/components/gallery/ImageGrid.vue';
import CategoryManageModal from '@/components/modals/CategoryManageModal.vue';
import ImageDetailModal from '@/components/modals/ImageDetailModal.vue';

const isCatModalVisible = ref(false);
const isDetailModalVisible = ref(false);
const selectedImage = ref(null);

watch(() => store.isDarkMode, (newVal) => {
  if (newVal) {
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.add('light-mode');
  }
}, { immediate: true });

const AppSwal = Swal.mixin({
  background: '#1a1a1a',
  color: '#ffffff',
  confirmButtonColor: '#2563eb',
  cancelButtonColor: '#4b5563',
  customClass: {
    popup: 'my-swal-popup',
    title: 'my-swal-title',
    input: 'my-swal-select',
    confirmButton: 'my-swal-confirm',
    cancelButton: 'my-swal-cancel'
  }
});

onMounted(() => {
  initStore();
});

// API Actions
async function toggleFavorite(imageId) {
  const img = store.images.find(i => i.id === imageId);
  if (!img) return;
  await fetch(`${BASE_URL}/images/toggle-favorite/${imageId}`, {
    method: 'PATCH'
  });
}

async function toggleFavDetail(imageId) {
  await toggleFavorite(imageId);
  // Update local ref instantly for modal reactivity if needed
  if (selectedImage.value) selectedImage.value.isFavorite = !selectedImage.value.isFavorite;
}

async function markImageDead(imageId) {
  const img = store.images.find(i => i.id === imageId);
  if (!img || img.isDead) return;
  await fetch(`${BASE_URL}/images/${imageId}/mark-dead`, { method: 'PATCH' });
}

function navigateImage(direction) {
  const currentIndex = filteredImages.value.findIndex(i => i.id === selectedImage.value.id);
  if (currentIndex === -1) return;
  
  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < filteredImages.value.length) {
    selectedImage.value = filteredImages.value[nextIndex];
  }
}

async function moveToTrash(imageId) {
  const result = await AppSwal.fire({
    title: 'Move to trash?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, trash it!'
  });
  if (result.isConfirmed) {
    await fetch(`${BASE_URL}/images/${imageId}/trash`, { method: 'PATCH' });
  }
}

async function moveToTrashDetail(imageId) {
  await moveToTrash(imageId);
  closeDetailModal();
}

async function handleSafeArchive(imageId) {
  const img = store.images.find(i => i.id === imageId);
  if (!img) return;

  await AppSwal.fire({
      title: '<i class="fas fa-shield" style="color:var(--accent)"></i> Safe Archive',
      html: `
          <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
              <p>🛡️ To save the image to your local archive:</p>
              <ol>
                  <li>Click the link below and save the image to your <b>Downloads</b> folder.</li>
                  <div style="margin: 15px 0; background: #000; padding: 12px; border-radius: 8px; border: 1px solid #333;">
                      <a href="${img.originalUrl}" target="_blank" style="color: #10b981; text-decoration: none; word-break: break-all; font-family: monospace;">
                          ${img.originalUrl}
                      </a>
                  </div>
                  <li>Once downloaded, click the <b>Confirm</b> button below.</li>
              </ol>
          </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Downloaded, Confirm ✅',
      confirmButtonColor: '#10b981',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
          try {
              const response = await fetch(`${BASE_URL}/images/${imageId}/verify-and-shield`, { method: 'POST' });
              const result = await response.json();
              if (!response.ok) throw new Error(result.detail || "File not found");
              return result; 
          } catch (error) {
              AppSwal.showValidationMessage(`Error: ${error.message}`);
          }
      }
  }).then((result) => {
      if (result.isConfirmed) {
          img.isSafe = true;
          if (result.value && result.value.safe_path) {
              img.SafePath = result.value.safe_path;
          }
          if (selectedImage.value && selectedImage.value.id === imageId) {
              selectedImage.value.isSafe = true;
              if (result.value && result.value.safe_path) selectedImage.value.SafePath = result.value.safe_path;
          }
          closeDetailModal();
          AppSwal.fire({ icon: 'success', title: 'Shield Active!', timer: 1500, showConfirmButton: false });
      }
  });
}

async function permanentDelete(imageId) {
  const result = await AppSwal.fire({
    title: 'Are you sure?',
    text: 'This image will be permanently deleted and removed from the disk, even if it is under the shield!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Delete Everywhere',
    confirmButtonColor: '#EF4444'
  });
  if (result.isConfirmed) {
    await fetch(`${BASE_URL}/images/permanent-delete/${imageId}`, { method: 'DELETE' });
  }
}

async function restoreImage(imageId) {
  const img = store.images.find(i => i.id === imageId);
  if (!img) return;

  if (!store.categories.includes(img.category)) {
      const result = await AppSwal.fire({
          icon: 'error',
          title: 'Category Not Found',
          text: 'Please select a category, the original restore category could not be found.',
          showCancelButton: true,
          confirmButtonText: 'Select Category',
          cancelButtonText: 'Cancel'
      });
      if (result.isConfirmed) {
          await changeImageCategory(imageId, true);
      }
      return;
  }

  await fetch(`${BASE_URL}/images/change-category`, { 
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: imageId, category: img.category, restore: true })
  });
}

async function emptyTrash() {
  const trashCount = store.images.filter(img => img.isDeleted).length;
  if (trashCount === 0) {
    return AppSwal.fire({ icon: 'info', title: 'Empty', text: 'No images to burn.', timer: 2000, showConfirmButton: false });
  }

  const result = await AppSwal.fire({
    title: 'Are you sure?',
    text: `${trashCount} images in the trash bin will be burned!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-fire"></i> Yes, burn it!',
    confirmButtonColor: '#EF4444'
  });
  if (result.isConfirmed) {
    await fetch(`${BASE_URL}/empty-trash`, { method: 'DELETE' });
  }
}

async function changeImageCategory(imageId, isRestore = false) {
  const img = store.images.find(i => i.id === imageId);
  if (!img) return;

  const result = await AppSwal.fire({
    title: 'Change Category',
    input: 'select',
    inputOptions: store.categories
      .filter(cat => cat !== 'Uncategorized Favorites')
      .reduce((acc, cat) => { 
        acc[cat] = cat.length > 35 ? cat.substring(0, 35) + '...' : cat; 
        return acc; 
      }, {}),
    inputPlaceholder: 'Select a category',
    showCancelButton: true
  });
  
  if (result.isConfirmed && result.value) {
    if (result.value === img.category && !isRestore) {
        return AppSwal.fire({
            icon: 'info',
            title: 'Already in this category',
            text: 'The image is already in the selected category.',
            timer: 2000,
            showConfirmButton: false
        });
    }

    await fetch(`${BASE_URL}/images/change-category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: imageId, category: result.value, restore: isRestore })
    });
  }
}

async function changeCategoryDetail(imageId) {
    await changeImageCategory(imageId);
    if(selectedImage.value) closeDetailModal();
}

async function createCategory(catName) {
  const exists = store.categories.some(c => c.toLowerCase() === catName.toLowerCase());
  if (exists) {
      return AppSwal.fire({
          icon: 'error',
          title: 'Error',
          text: 'This category already exists!'
      });
  }

  await fetch(`${BASE_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: catName })
  });
}

async function deleteCategory(catName) {
  const target = catName || store.activeCategory;
  const realCatCount = store.categories.length;
  if (realCatCount <= 1) return AppSwal.fire({ icon: 'error', title: 'Error', text: 'You cannot delete the last category.' });

  const res = await fetch(`${BASE_URL}/categories`, { 
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: target })
  });
  const data = await res.json();

  if (data.status === "deleted") {
    if (store.activeCategory === target) {
      store.activeCategory = 'All Images';
    }
    return AppSwal.fire("Deleted", "", "success");
  }

  const decision = await AppSwal.fire({
    icon: 'warning', 
    title: `Deleting '${target}'`, 
    text: `${data.count} images found. Favorites are kept.`,
    showDenyButton: true, 
    showCancelButton: true, 
    confirmButtonText: 'Delete Images', 
    denyButtonText: 'Move Elsewhere'
  });

  if (decision.isDismissed) return;

  if (decision.isConfirmed) {
    await fetch(`${BASE_URL}/categories`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: target, action: "delete_images" })
    });
    if (store.activeCategory === target) {
      store.activeCategory = 'All Images';
    }
  }

  if (decision.isDenied) {
    const options = store.categories.filter(c => c !== target && c !== 'Uncategorized Favorites');
    const { value: moveTo } = await AppSwal.fire({
      title: 'Move where?', 
      input: 'select', 
      inputOptions: Object.fromEntries(options.map(o => [o, o.length > 35 ? o.substring(0, 35) + '...' : o])), 
      showCancelButton: true
    });
    if (!moveTo) return;

    await fetch(`${BASE_URL}/categories`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: target, action: "move_images", moveTo })
    });
    if (store.activeCategory === target) {
      store.activeCategory = moveTo;
    }
  }
}

async function renameCategory() {
  const oldName = store.activeCategory;
  renameCatFromModal(oldName);
}

async function renameCatFromModal(oldName) {
  const result = await AppSwal.fire({
    title: 'Rename Category',
    input: 'text',
    inputValue: oldName,
    showCancelButton: true
  });
  if (result.isConfirmed && result.value && result.value !== oldName) {
    const newName = result.value.trim();
    if (!newName) return;

    const exists = store.categories.some(c => c.toLowerCase() === newName.toLowerCase() && c.toLowerCase() !== oldName.toLowerCase());
    if (exists) {
        return AppSwal.fire({
            icon: 'error',
            title: 'Error',
            text: 'A category with this name already exists!'
        });
    }

    await fetch(`${BASE_URL}/categories/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName: oldName, newName: newName })
    });
    if (store.activeCategory === oldName) {
      store.activeCategory = newName;
    }
  }
}

function openDetailModal(img) {
  selectedImage.value = img;
  isDetailModalVisible.value = true;
}

function closeDetailModal() {
  isDetailModalVisible.value = false;
  selectedImage.value = null;
}

function showComingSoon(featureName) {
  AppSwal.fire({
    icon: 'info',
    title: featureName,
    text: 'This feature is currently under development! With the Vue.js (V3) update, it will be integrated directly into the system without needing external services. Stay tuned! 😎',
    confirmButtonText: 'Can\'t wait 🚀',
    confirmButtonColor: '#6366f1'
  });
}
</script>
