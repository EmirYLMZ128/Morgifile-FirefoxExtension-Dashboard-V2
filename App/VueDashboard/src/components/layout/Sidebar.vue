<template>
  <aside class="sidebar h-full" :class="{ 'collapsed': isCollapsed }">
    <div class="sidebar-header">
      <div class="logo">
        <i class="fas fa-folder-open"></i>
        <span class="logo-text">Morgi</span>
      </div>
      <button class="toggle-btn" @click="isCollapsed = !isCollapsed">
        <i class="fas" :class="isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'"></i>
      </button>
    </div>
    
    <nav class="nav-menu">
      <div class="nav-section"><span class="section-text">General</span></div>
      <div class="nav-item" :class="{ active: store.activeCategory === 'All Images' }" @click="setCategory('All Images')" :title="isCollapsed ? 'All Images' : ''">
        <i class="fas fa-th-large"></i> <span class="nav-text">All Images</span>
      </div>
      <div class="nav-item" :class="{ active: store.activeCategory === 'Favorites' }" @click="setCategory('Favorites')" :title="isCollapsed ? 'Favorites' : ''">
        <i class="fas fa-star"></i> <span class="nav-text">Favorites</span>
      </div>
      <div class="nav-item" :class="{ active: store.activeCategory === 'Graveyard' }" @click="setCategory('Graveyard')" :title="isCollapsed ? 'Graveyard' : ''">
        <i class="fas fa-skull-crossbones"></i> <span class="nav-text cat-name">Graveyard</span>
      </div>
      <div class="nav-item" :class="{ active: store.activeCategory === 'Trash' }" @click="setCategory('Trash')" :title="isCollapsed ? 'Trash' : ''">
        <i class="fas fa-trash-alt"></i> <span class="nav-text">Trash</span>
      </div>
      
      <div class="nav-section"><span class="section-text">Categories</span></div>
      <div id="sidebar-categories" class="flex-col pb-4">
        <div v-for="cat in store.categories" :key="cat" 
             class="nav-item category-item" 
             :class="{ active: store.activeCategory === cat }" 
             @click="setCategory(cat)"
             :title="isCollapsed ? cat : ''">
          <span class="cat-icon-text">{{ cat.substring(0, 2).toUpperCase() }}</span>
          <span class="nav-text cat-name">{{ cat }}</span>
        </div>
      </div>
    </nav>

    <button class="btn-manage mt-auto" @click="$emit('openManageCategories')" :title="isCollapsed ? 'Manage Categories' : ''">
      <i class="fas fa-sliders-h"></i> <span class="nav-text">Manage Categories</span>
    </button>
  </aside>
</template>

<script setup>
import { ref } from 'vue';
import { store } from '@/store';

const emit = defineEmits(['openManageCategories']);
const isCollapsed = ref(false);

function setCategory(cat) {
  store.activeCategory = cat;
}
</script>
