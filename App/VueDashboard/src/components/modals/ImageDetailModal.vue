<template>
  <div v-if="isVisible" class="detail-modal-overlay" style="display: flex" @click="$emit('close')">
    <div class="detail-modal-container" @click.stop>
      <div class="detail-left">
        <img :src="imgSrc" alt="Image Detail">
      </div>

      <div class="detail-right">
        <div class="detail-info-group">
          <h3>Image Details</h3>
          
          <div class="info-item">
            <span class="info-label">Site:</span>
            <span class="info-value">{{ img.site || 'N/A' }}</span>
          </div>
          
          <div class="info-item" v-if="img.sourceUrl">
            <span class="info-label">Source Post:</span>
            <a :href="img.sourceUrl" target="_blank" class="info-value" style="color: var(--accent); text-decoration: none;">Go to Original Post 🔗</a>
          </div>
          
          <div class="info-item">
            <span class="info-label">URL:</span>
            <a :href="img.originalUrl" target="_blank" class="info-link">Go to Source <i class="fas fa-external-link-alt"></i></a>
          </div>
          
          <div class="info-item">
            <span class="info-label">Category:</span>
            <span class="info-value">{{ img.category }}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Size:</span>
            <span class="info-value" id="info-size">{{ img.width || 0 }}px x {{ img.height || 0 }}px</span>
          </div>

          <hr class="detail-divider">

          <template v-if="!img.isDead">
            <div class="ai-section">
              <div class="info-label">Prompt:</div>
              <div class="ai-content">
                <button class="outline-btn disabled" @click="$emit('showComingSoon', 'AI Prompt Engine 🤖')" title="Coming Soon!">
                  <i class="fas fa-robot"></i> Generate Prompt
                </button>
              </div>
            </div>

            <div class="ai-section">
              <div class="info-label">Color Palette:</div>
              <div class="ai-content">
                <button class="outline-btn disabled" @click="$emit('showComingSoon', 'Color Palette Engine 🎨')" title="Coming Soon!">
                  <i class="fas fa-palette"></i> Extract Color
                </button>
              </div>
            </div>
            
            <div class="ai-section">
              <div class="info-label">Search Engines:</div>
              <div class="ai-content">
                <button class="outline-btn" @click="openLink(`https://lens.google.com/uploadbyurl?url=${safeUrl}`)" title="Search on Google Lens">
                  <i class="fas fa-search"></i> Lens
                </button>
                <button class="outline-btn" @click="openLink(`https://yandex.com/images/search?rpt=imageview&url=${safeUrl}`)" title="Find similar on Yandex">
                  <i class="fab fa-yandex-international"></i> Yandex
                </button>
                <button class="outline-btn" @click="openLink(`https://tineye.com/search?url=${safeUrl}`)" title="Find source with TinEye">
                  <i class="fas fa-eye"></i> TinEye
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="action-btn-list">
          <button class="action-btn nav-arrow" :disabled="!hasPrev" :class="{ disabled: !hasPrev }" @click="hasPrev && $emit('navigate', -1)">
            <i class="fas fa-arrow-left"></i>
          </button>

          <template v-if="img.isDead">
            <button class="action-btn delete" @click="$emit('moveToTrash', img.id)" title="Move to Trash">
              <i class="fas fa-trash"></i>
            </button>
          </template>
          <template v-else>
            <button class="action-btn fav-btn" :class="{ 'active-fav': img.isFavorite }" @click="$emit('toggleFavorite', img.id)">
              <i class="fas fa-star"></i>
            </button>
            <button class="action-btn safe-btn" :class="{ 'active-safe': img.isSafe }" :disabled="img.isSafe" :style="{ cursor: img.isSafe ? 'default' : 'pointer' }" @click="!img.isSafe && $emit('handleSafeArchive', img.id)">
              <i class="fas fa-shield"></i>
            </button>
            <button class="action-btn edit" @click="$emit('changeCategory', img.id)">
              <i class="fas fa-folder-open"></i>
            </button>
            <button v-if="!img.isFavorite" class="action-btn delete" @click="$emit('moveToTrash', img.id)" title="Move to Trash">
              <i class="fas fa-trash"></i>
            </button>
          </template>

          <button class="action-btn nav-arrow" :disabled="!hasNext" :class="{ disabled: !hasNext }" @click="hasNext && $emit('navigate', 1)">
            <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { filteredImages } from '@/store';

const props = defineProps({
  isVisible: { type: Boolean, required: true },
  img: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['close', 'showComingSoon', 'moveToTrash', 'toggleFavorite', 'handleSafeArchive', 'changeCategory', 'navigate']);

const currentIndex = computed(() => {
    return filteredImages.value.findIndex(i => i.id === props.img.id);
});

const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < filteredImages.value.length - 1);

function handleKeydown(e) {
    if (!props.isVisible) return;
    if (e.key === 'ArrowLeft' && hasPrev.value) {
        emit('navigate', -1);
    } else if (e.key === 'ArrowRight' && hasNext.value) {
        emit('navigate', 1);
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
});

const safeUrl = computed(() => encodeURIComponent(props.img.originalUrl || ''));

const imgSrc = computed(() => {
  if (!props.img || !props.img.id) return '';
  if (props.img.isDead) return `http://127.0.0.1:8000/thumbnail/${props.img.id}`;
  if (props.img.isSafe && props.img.SafePath) return `http://127.0.0.1:8000/safe-file?path=${encodeURIComponent(props.img.SafePath)}`;
  if (props.img.isCORS || props.img.proxyTried) return `http://127.0.0.1:8000/proxy/image?url=${encodeURIComponent(props.img.originalUrl)}`;
  return props.img.originalUrl;
});

function openLink(url) {
  window.open(url, '_blank');
}
</script>
