<template>
  <main class="gallery-container" ref="scrollContainer" @scroll="handleScroll">
    <div v-if="filteredImages.length === 0" class="empty-placeholder">
      <i class="fas fa-folder-open"></i>
      <p>No images found in {{ store.activeCategory }}</p>
    </div>
    
    <div v-else class="image-grid active-grid">
      <div class="masonry-column" v-for="colIndex in 6" :key="colIndex">
        <ImageCard 
          v-for="img in columns[colIndex - 1]" 
          :key="img.id" 
          :img="img"
          @selectImage="$emit('selectImage', $event)"
          @permanentDelete="$emit('permanentDelete', $event)"
          @restoreImage="$emit('restoreImage', $event)"
          @moveToTrash="$emit('moveToTrash', $event)"
          @toggleFavorite="$emit('toggleFavorite', $event)"
          @changeCategory="$emit('changeCategory', $event)"
          @markDead="$emit('markDead', $event)"
        />
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { store, filteredImages } from '@/store';
import ImageCard from './ImageCard.vue';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

defineEmits([
  'selectImage',
  'permanentDelete',
  'restoreImage',
  'moveToTrash',
  'toggleFavorite',
  'changeCategory',
  'markDead'
]);

const itemsPerPage = 30;
const currentLimit = ref(itemsPerPage);
const scrollContainer = ref(null);

const visibleImages = computed(() => {
  return filteredImages.value.slice(0, currentLimit.value);
});

const columns = computed(() => {
  const cols = [[], [], [], [], [], []];
  const colHeights = [0, 0, 0, 0, 0, 0];
  
  visibleImages.value.forEach(img => {
    let ratio = 1; // Fallback to square if dimensions are missing
    if (img.width && img.height) {
      ratio = img.height / img.width;
    }
    
    // Find shortest column
    let minIdx = 0;
    let minHeight = colHeights[0];
    for (let i = 1; i < 6; i++) {
      if (colHeights[i] < minHeight) {
        minHeight = colHeights[i];
        minIdx = i;
      }
    }
    
    cols[minIdx].push(img);
    colHeights[minIdx] += ratio;
  });
  
  return cols;
});

watch(() => store.activeCategory, () => {
  currentLimit.value = itemsPerPage;
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
  }
});

onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
  }
});

function handleScroll(e) {
  const target = e.target;
  const bottomThreshold = 600; // Load more when 600px from the bottom
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - bottomThreshold) {
    if (currentLimit.value < filteredImages.value.length) {
      currentLimit.value += itemsPerPage;
    }
  }
}
</script>
