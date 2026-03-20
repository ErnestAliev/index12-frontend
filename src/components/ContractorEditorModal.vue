<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import EntityListEditor from './EntityListEditor.vue';
import CreateEntityModal from './CreateEntityModal.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const contractorItems = computed(() => mainStore.contractors || []);
const contractorCount = computed(() => contractorItems.value.length);

const contractorEditorRef = ref(null);
const showCreateEntityModal = ref(false);

const closeModal = () => {
  emit('close');
};

const handleBatchSave = async (items) => {
  await mainStore.batchUpdateEntities('contractors', items);
};

const triggerSave = async () => {
  await contractorEditorRef.value?.triggerSave?.();
};

const openCreateModal = () => {
  showCreateEntityModal.value = true;
};

const handleCreated = () => {
  showCreateEntityModal.value = false;
};
</script>

<template>
  <div class="popup-overlay" @click.self="closeModal">
    <div class="popup-content contractor-popup">
      <div class="popup-header">
        <div class="header-row">
          <h3>Редактор контрагентов</h3>

          <div class="header-actions">
            <div class="summary-bar" :title="`Всего контрагентов: ${contractorCount}`">
              <span class="summary-label">Контрагентов:</span>
              <span class="summary-value">{{ contractorCount }}</span>
            </div>

            <button class="close-icon-btn" @click="closeModal" aria-label="Закрыть">&times;</button>
          </div>
        </div>
      </div>

      <div class="popup-body">
        <EntityListEditor
          ref="contractorEditorRef"
          embedded
          :show-header="false"
          :show-footer="false"
          title="Редактор контрагентов"
          entity-type="contractors"
          :items="contractorItems"
          @close="closeModal"
          @save="handleBatchSave"
        />
      </div>

      <div class="popup-footer">
        <div class="footer-left-actions">
          <button class="btn-add-new-footer btn-create" @click="openCreateModal">+ Создать контрагента</button>
        </div>

        <div class="footer-actions">
          <button class="btn-save" @click="triggerSave">Сохранить</button>
          <button class="btn-close" @click="closeModal">Закрыть</button>
        </div>
      </div>
    </div>

    <CreateEntityModal
      v-if="showCreateEntityModal"
      entity-type="contractors"
      @close="showCreateEntityModal = false"
      @created="handleCreated"
    />
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3500;
  overflow-y: auto;
}

.popup-content {
  background: var(--color-background);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  height: 78vh;
  margin: 2rem 1rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  width: 95%;
  max-width: 1480px;
  border: 1px solid var(--color-border);
}

.popup-header {
  padding: 1.5rem 1.5rem 0.5rem;
}

h3 {
  margin: 0;
  font-size: 24px;
  color: var(--color-heading);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.header-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-bar {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  white-space: nowrap;
}

.summary-label {
  font-size: 12px;
  color: var(--color-text-soft);
  font-weight: 600;
}

.summary-value {
  font-size: 14px;
  color: var(--color-heading);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.close-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  border-radius: 8px;
  color: var(--color-text-soft);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}

.close-icon-btn:hover {
  background: var(--color-background-mute);
  border-color: var(--color-border-hover);
  color: var(--color-text);
}

.popup-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.popup-body :deep(.popup-content.embedded) {
  padding: 0 0 1rem;
}

.popup-body :deep(.list-editor) {
  padding-right: 0;
}

.popup-body :deep(.inner-overlay) {
  border-radius: 0;
}

.popup-footer {
  padding: 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--color-background);
  border-radius: 0 0 12px 12px;
  gap: 12px;
}

.footer-left-actions,
.footer-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-add-new-footer,
.btn-close,
.btn-save {
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.btn-create {
  border: 1px solid transparent;
  background: #10b981;
  color: #fff;
}

.btn-create:hover {
  background: #059669;
}

.btn-save {
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
}

.btn-save:hover {
  background: #1f2937;
  border-color: #1f2937;
}

.btn-close {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.btn-close:hover {
  background: var(--color-background-mute);
}

@media (max-width: 1100px) {
  .header-row,
  .popup-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions,
  .footer-left-actions,
  .footer-actions {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .popup-content {
    height: 100vh;
    width: 100vw;
    max-width: none;
    margin: 0;
    border-radius: 0;
  }

  .popup-header {
    padding: 1rem 1rem 0.5rem;
  }

  .popup-footer {
    padding: 1rem;
  }

  .footer-actions {
    justify-content: flex-end;
  }
}
</style>
