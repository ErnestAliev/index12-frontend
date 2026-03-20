<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import EntityListEditor from './EntityListEditor.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const contractorItems = computed(() => mainStore.contractors || []);

const closeModal = () => {
  emit('close');
};

const handleSave = async (items) => {
  await mainStore.batchUpdateEntities('contractors', items);
};
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="contractor-editor-modal">
      <div class="modal-header">
        <div class="header-copy">
          <h2>Редактор контрагентов</h2>
          <p>ИИН/БИН, договоры, проекты и категории в одном окне.</p>
        </div>

        <button class="close-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
      </div>

      <div class="modal-body">
        <EntityListEditor
          embedded
          title="Список контрагентов"
          entity-type="contractors"
          widget-key="contractors"
          :items="contractorItems"
          @close="closeModal"
          @save="handleSave"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(3px);
}

.contractor-editor-modal {
  width: min(96vw, 1480px);
  height: min(90vh, 980px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-background);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.header-copy {
  min-width: 0;
}

.header-copy h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.3rem;
  font-weight: 600;
}

.header-copy p {
  margin: 4px 0 0;
  color: var(--color-text-soft);
  font-size: 0.92rem;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-soft);
  font-size: 32px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.close-btn:hover {
  color: var(--color-text);
}

.modal-body {
  flex: 1;
  min-height: 0;
  background: var(--color-background);
}

.modal-body :deep(.popup-content.embedded) {
  padding-top: 1.75rem;
}

.modal-body :deep(.header-with-toggle) {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 900px) {
  .contractor-editor-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }

  .modal-header {
    padding: 14px 18px;
  }

  .header-copy p {
    font-size: 0.85rem;
  }

  .modal-body :deep(.popup-content.embedded) {
    padding: 1rem 1rem 1.5rem;
  }
}
</style>
