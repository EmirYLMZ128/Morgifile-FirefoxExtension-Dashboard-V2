import { reactive, computed } from 'vue';

export const BASE_URL = window.location.port === '5173' ? 'http://127.0.0.1:8000' : window.location.origin;
const WS_BASE_URL = window.location.port === '5173' ? 'ws://127.0.0.1:8000' : `ws://${window.location.host}`;

export const store = reactive({
  images: [],
  categories: [],
  activeCategory: 'All Images',
  isConnected: false,
  colorMatchHex: '#ffffff',
  isDarkMode: true
});

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}
function getColorDistance(hex1, hex2) {
    if (!hex1 || !hex2 || hex1 === '---' || hex2 === '---') return 9999;
    let c1 = hexToRgb(hex1);
    let c2 = hexToRgb(hex2);
    if (!c1 || !c2) return 9999;
    return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

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
      if (store.activeCategory === 'Color Match') {
          if (!store.colorMatchHex) return true;
          return getColorDistance(img.mainColor, store.colorMatchHex) < 100;
      }
      if (store.activeCategory === 'All Images') return true;
      if (isFavoritesView) return img.isFavorite;

      return img.category === store.activeCategory;
  });
});

// Websocket Handling
let ws = null;

export function connectWebSocket() {
  const wsUrl = `${WS_BASE_URL}/ws`;
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
        Object.assign(store.images[idx], data.payload);
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
    const res = await fetch(`${BASE_URL}/images`);
    const data = await res.json();
    store.images = data;
  } catch (err) {
    console.error("Failed to load images:", err);
  }
}

export async function fetchCategories() {
  try {
    const res = await fetch(`${BASE_URL}/categories`);
    const data = await res.json();
    if (data && data.categories) {
      const cats = data.categories.map(c => c.name);
      if (!cats.includes('Uncategorized Favorites')) {
        cats.push('Uncategorized Favorites');
      }
      store.categories = cats;
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
