<!-- 
  Version: 1.1
  Fix description: 
  1. Переименован заголовок виджета в "Мои переводы".
  2. Исправлена логика подсчета итоговой суммы (добавлена проверка на валидность чисел).
-->
<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { storeToRefs } from 'pinia'
import iconViewBig from '@/assets/icon_view_big.png'
import iconViewSmal from '@/assets/icon_view_smal.png'
import EntityListEditor from './EntityListEditor.vue'
import { formatMoney } from '../utils/formatters'

const props = defineProps({
  title: {
    type: String,
    default: 'Мои переводы' // Changed default title
  }
})

const mainStore = useMainStore()
const { liabilities } = storeToRefs(mainStore)
const { updateLiability, createLiability, deleteLiability } = mainStore

const isEditorOpen = ref(false)

// Исправлена логика подсчета: добавлена конвертация в число и проверка на NaN
const totalLiabilities = computed(() => {
  if (!liabilities.value || !Array.isArray(liabilities.value)) return 0
  return liabilities.value.reduce((acc, item) => {
    const amount = parseFloat(item.amount)
    return acc + (isNaN(amount) ? 0 : amount)
  }, 0)
})

const formattedTotal = computed(() => formatMoney(totalLiabilities.value))

const handleSave = async (items) => {
  // Логика сохранения списка (включая порядок, если будет реализовано)
  // Здесь мы просто обновляем данные через store
  // Для каждого элемента проверяем, новый он или измененный
  
  // В данном простом примере редактора, возможно, нужно более сложное взаимодействие,
  // но пока оставим базовое обновление списка через API стора
}

</script>

<template>
  <div class="card-container">
    <div class="card-header">
      <div class="title-group">
        <!-- Используем проп title, но по умолчанию он теперь "Мои переводы" -->
        <h2 class="card-title">{{ title }}</h2>
        <button class="edit-btn" @click="isEditorOpen = true">
          <img src="@/assets/filter-edit.svg" alt="Edit" />
        </button>
      </div>
      <div class="card-total">{{ formattedTotal }}</div>
    </div>

    <div class="card-content">
      <div v-for="item in liabilities" :key="item.id" class="list-item">
        <span class="item-name">{{ item.name }}</span>
        <span class="item-amount">{{ formatMoney(item.amount) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <img :src="iconViewBig" class="icon-big" />
      <img :src="iconViewSmal" class="icon-small" />
    </div>

    <EntityListEditor
      v-if="isEditorOpen"
      title="Редактирование переводов"
      :entities="liabilities"
      @close="isEditorOpen = false"
      @save="handleSave"
      @update="updateLiability"
      @create="createLiability"
      @delete="deleteLiability"
    />
  </div>
</template>

<style scoped>
.card-container {
  background: #ffffff;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  font-family: 'Inter', sans-serif;
  font-style: normal;
  font-weight: 600;
  font-size: 16px;
  line-height: 19px;
  color: #1a1a1a;
  margin: 0;
}

.edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.edit-btn:hover {
  opacity: 1;
}

.card-total {
  font-family: 'Inter', sans-serif;
  font-style: normal;
  font-weight: 700;
  font-size: 20px;
  line-height: 24px;
  color: #1a1a1a;
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  margin-bottom: 40px; /* место под иконки */
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 8px;
}

.list-item:last-child {
  border-bottom: none;
}

.item-name {
  color: #666666;
  font-weight: 400;
}

.item-amount {
  color: #1a1a1a;
  font-weight: 600;
}

.card-footer {
  position: absolute;
  bottom: 16px;
  left: 20px;
  right: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  pointer-events: none;
}

.icon-big {
  width: 32px;
  height: 32px;
  opacity: 0.1;
}

.icon-small {
  width: 24px;
  height: 24px;
  opacity: 0.1;
}
</style>