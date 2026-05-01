import { reactive, computed } from 'vue';

export const store = reactive({
  images: [],
  categories: [],
  activeCategory: 'All Images',
  isConnected: false
});

export const filteredImages = computed(() => {
  const isGraveyardView = store.activeCategory === 'Graveyard';
  const isTrashView = store.activeCategory === 'Trash';
  const isFavoritesView = store.activeCategory === 'Favorites';

  return store.images.filter(img => {
      if (img.isDeleted) return isTrashView;
      if (isTrashView) return false;

      // Handle Graveyard
      if (isGraveyardView) return img.isDead;
      if (img.isDead) return false;

      // Regular logic
      if (store.activeCategory === 'All Images') return true;
      if (isFavoritesView) return img.isFavorite;

      return img.category === store.activeCategory;
  });
});

// Websocket Handling
let ws = null;

export function connectWebSocket() {
  const wsUrl = `ws://127.0.0.1:8000/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    store.isConnected = true;
    console.log("WebSocket connected.");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'NEW_IMAGE') {
      store.images.unshift(data.payload);
    } else if (data.type === 'IMAGE_UPDATED' || data.type === 'IMAGE_DELETED') {
      const idx = store.images.findIndex(img => img.id === data.payload.id);
      if (idx !== -1) {
        if (data.type === 'IMAGE_DELETED' && data.payload.isDeleted) {
            // Updated as deleted
            store.images[idx] = { ...store.images[idx], ...data.payload };
        } else {
            store.images[idx] = { ...store.images[idx], ...data.payload };
        }
      }
    } else if (data.type === 'IMAGE_PERMANENTLY_DELETED') {
      store.images = store.images.filter(img => img.id !== data.payload.id);
    } else if (data.type === 'IMAGE_TRASHED') {
      const idx = store.images.findIndex(img => img.id === data.payload.id);
      if (idx !== -1) store.images[idx] = { ...store.images[idx], isDeleted: true };
    } else if (data.type === 'FAVORITE_TOGGLED') {
      const idx = store.images.findIndex(img => img.id === data.payload.id);
      if (idx !== -1) store.images[idx] = { ...store.images[idx], isFavorite: data.payload.isFavorite };
    } else if (data.type === 'TRASH_EMPTIED') {
      store.images = store.images.filter(img => !img.isDeleted);
    } else if (data.type === 'CATEGORIES_UPDATED' || data.type === 'CATEGORY_UPDATED') {
      fetchCategories();
      fetchImages();
    } else if (data.type === 'RELOAD_DATA') {
      fetchImages();
    }
  };

  ws.onclose = () => {
    store.isConnected = false;
    setTimeout(connectWebSocket, 3000);
  };
}

export async function fetchImages() {
  try {
    const res = await fetch('http://127.0.0.1:8000/images');
    const data = await res.json();
    store.images = data;
  } catch (err) {
    console.error("Failed to load images:", err);
  }
}

export async function fetchCategories() {
  try {
    const res = await fetch('http://127.0.0.1:8000/categories');
    const data = await res.json();
    if (data && data.categories) {
      store.categories = data.categories
        .filter(c => !c.isSystem)
        .map(c => c.name);
    }
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

export function initStore() {
  fetchImages();
  fetchCategories();
  connectWebSocket();
}
