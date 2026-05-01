<template>
  <div class="image-card" @click="$emit('selectImage', img)">
    <div v-if="!isLoaded && !isBroken" class="placeholder-square">
      <i class="fas fa-spinner fa-spin"></i>
    </div>
    
    <div v-if="isBroken" class="placeholder-square">
      <i class="fas fa-image" style="opacity: 0.3;"></i>
      <i class="fas fa-slash" style="position: absolute; font-size: 2.5rem; opacity: 0.5;"></i>
    </div>

    <img 
      v-show="isLoaded && !isBroken" 
      :src="imgSrc" 
      alt="" 
      @load="onImageLoad" 
      @error="handleImageError" 
    />
    
    <div class="card-overlay"></div>
    <div class="card-actions" @click.stop>
      <template v-if="img.isDeleted">
        <button class="card-btn permanent-delete-btn" @click="$emit('permanentDelete', img.id)" title="Delete permanently">
          <i class="fas fa-fire"></i>
        </button>
        <button class="card-btn edit-btn" @click="$emit('restoreImage', img.id)" title="Restore">
          <i class="fas fa-undo"></i>
        </button>
      </template>
      
      <template v-else-if="img.isDead">
        <button class="card-btn delete-btn" @click="$emit('moveToTrash', img.id)" title="Move to trash">
          <i class="fas fa-trash"></i>
        </button>
      </template>
      
      <template v-else>
        <button class="card-btn fav-btn" :class="{ 'active-fav': img.isFavorite }" @click="$emit('toggleFavorite', img.id)" title="Favorite">
          <i class="fas fa-star"></i>
        </button>
        
        <button v-if="!img.isFavorite" class="card-btn delete-btn" @click="$emit('moveToTrash', img.id)" title="Move to trash">
          <i class="fas fa-trash"></i>
        </button>
        
        <button class="card-btn edit-btn" @click="$emit('changeCategory', img.id)" title="Change category">
          <i class="fas fa-folder-open"></i>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue';

const props = defineProps({
  img: { type: Object, required: true }
});

const emit = defineEmits(['selectImage', 'permanentDelete', 'restoreImage', 'moveToTrash', 'toggleFavorite', 'changeCategory', 'markDead']);

const isLoaded = ref(false);
const isBroken = ref(false);

const imgSrc = computed(() => {
  if (props.img.isDead) return `http://127.0.0.1:8000/thumbnail/${props.img.id}`;
  if (props.img.isSafe && props.img.SafePath) return `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(props.img.SafePath)}`;
  if (props.img.isCORS || props.img.proxyTried) return `http://127.0.0.1:8000/proxy/image?url=${encodeURIComponent(props.img.originalUrl)}`;
  return props.img.originalUrl;
});

watch(imgSrc, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc) {
    isLoaded.value = false;
    isBroken.value = false;
  }
});

function onImageLoad() {
    isLoaded.value = true;
}

function handleImageError(e) {
  if (props.img.isDead) {
    isBroken.value = true;
    return;
  }
  
  if (props.img.proxyTried || imgSrc.value.includes('/proxy/image')) {
    emit('markDead', props.img.id);
  } else {
    props.img.proxyTried = true; // This will trigger the computed imgSrc and watcher automatically
  }
}
</script>
