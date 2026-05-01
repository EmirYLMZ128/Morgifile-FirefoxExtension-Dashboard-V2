<template>
  <header class="top-header">
    <div class="header-left">
      <div class="current-category-info" id="active-category-display">
        <span id="active-category-name">{{ store.activeCategory }}</span>
      </div>
    </div>
    <div class="header-right">
      <button v-if="!['Trash', 'Graveyard'].includes(store.activeCategory)"
              class="action-btn edit relative"
              :style="autoScrollSpeed > 0 ? 'background: var(--accent); color: white; box-shadow: 0 0 20px rgba(99, 102, 241, 0.5); border-color: transparent; transform: translateY(-2px);' : ''"
              @click="toggleAutoScroll"
              :title="scrollTitle">
        <i class="fas" :class="autoScrollSpeed === 3 ? 'fa-stop' : 'fa-angle-double-down'"></i>
        <span v-if="autoScrollSpeed > 0" class="absolute -bottom-1 -right-1 text-[10px] bg-[#EF4444] text-white rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-sm">
          {{ autoScrollSpeed }}
        </span>
      </button>

      <button v-if="store.activeCategory === 'Trash'" 
              class="pill-btn danger" 
              @click="$emit('emptyTrash')">
        <i class="fas fa-dumpster-fire"></i> Empty Trash
      </button>
      
      <div v-if="isCustomCategory" class="flex gap-2">
        <button class="action-btn edit" @click="$emit('renameCategory')" title="Rename Category">
          <i class="fas fa-edit"></i>
        </button>
        <button class="action-btn delete" @click="$emit('deleteCategory')" title="Delete Category">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import { store } from '@/store';

const isCustomCategory = computed(() => {
  const builtIns = ["All Images", "Favorites", "Graveyard", "Trash"];
  return !builtIns.includes(store.activeCategory);
});

const autoScrollSpeed = ref(0);
let scrollInterval = null;

const scrollTitle = computed(() => {
  if (autoScrollSpeed.value === 0) return 'Start Auto Scroll (Slow)';
  if (autoScrollSpeed.value === 1) return 'Speed: Normal';
  if (autoScrollSpeed.value === 2) return 'Speed: Fast';
  return 'Stop Auto Scroll';
});

const toggleAutoScroll = () => {
  autoScrollSpeed.value = (autoScrollSpeed.value + 1) % 4; // 0, 1, 2, 3
  
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }

  if (autoScrollSpeed.value > 0) {
    const speeds = { 1: 2, 2: 6, 3: 15 }; // Scroll steps in pixels
    const step = speeds[autoScrollSpeed.value];
    
    scrollInterval = setInterval(() => {
      const container = document.querySelector('.gallery-container');
      if (container) {
        container.scrollTop += step;
      }
    }, 20);
  }
};

watch(() => store.activeCategory, () => {
  if (autoScrollSpeed.value > 0) {
    autoScrollSpeed.value = 0;
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }
});

onUnmounted(() => {
  if (scrollInterval) clearInterval(scrollInterval);
});
</script>
