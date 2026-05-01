<template>
  <div v-if="isVisible" class="modal-overlay active" @click="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3>Manage Categories</h3>
        <button class="close-modal" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="add-cat-form">
          <input type="text" v-model="newCatName" placeholder="New category name..." @keyup.enter="createCategory">
          <button class="btn-primary" @click="createCategory">Add</button>
        </div>
        <div class="manage-cat-list">
          <div v-for="cat in store.categories" :key="cat" class="manage-cat-item">
            <span>{{ cat }}</span>
            <div class="cat-actions">
              <button class="action-btn edit" @click="$emit('renameCategory', cat)"><i class="fas fa-edit"></i></button>
              <button class="action-btn delete" @click="$emit('deleteCategory', cat)"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { store } from '@/store';

const props = defineProps({
  isVisible: { type: Boolean, required: true }
});

const emit = defineEmits(['close', 'renameCategory', 'deleteCategory', 'createCategory']);

const newCatName = ref('');

function createCategory() {
  if (!newCatName.value.trim()) return;
  emit('createCategory', newCatName.value.trim());
  newCatName.value = '';
}
</script>
