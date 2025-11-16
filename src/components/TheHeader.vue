<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v7.5-HEADER-REPLACE ---
 * * ВЕРСИЯ: 7.5 - Замена виджета при создании категории и фикс переименования
 * ДАТА: 2025-11-16
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX) `onCategoryAdd`: теперь при создании новой категории мы передаем индекс
 * виджета, на котором был клик.
 * 2. (FIX) `onEntitySave`: Если это создание категории, то после создания
 * мы вызываем `mainStore.replaceWidget(index, newKey)`, заменяя старый виджет на новый.
 * Это решает проблему "7-го виджета".
 * 3. (FIX) `onCategoryEdit`: Переименование теперь работает через попап,
 * который вызывает обновление в сторе.
 */

console.log('--- TheHeader.vue v7.5-HEADER-REPLACE ЗАГРУЖЕН ---');

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';
import TransferPopup from '@/components/TransferPopup.vue';

// Попапы
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';

const mainStore = useMainStore();
const isTransferPopupVisible = ref(false);

/* ======================= Адаптивность Дат ======================= */
const windowWidth = ref(window.innerWidth);
const updateWidth = () => { windowWidth.value = window.innerWidth; };
onMounted(() => window.addEventListener('resize', updateWidth));
onUnmounted(() => window.removeEventListener('resize', updateWidth));
const isTablet = computed(() => windowWidth.value < 1400);
const ruShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
const ruSuperShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const todayStr = computed(() => {
  const d = new Date();
  return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
});
const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
  if (d && !isNaN(d.getTime())) {
    return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
  }
  return todayStr.value;
});

/* ======================= Данные ======================= */
const loggedCurrentTotal = computed(() => mainStore.currentTotalBalance);
const loggedFutureTotal = computed(() => mainStore.futureTotalBalance);
const mergeBalances = (currentBalances, futureBalances) => {
  if (!currentBalances || !futureBalances) return currentBalances || []; 
  const futureMap = new Map(futureBalances.map(item => [item._id, item.balance]));
  return currentBalances.map(item => ({
    ...item,
    futureBalance: futureMap.get(item._id) ?? item.balance
  }));
};
const loggedAccountBalances = computed(() => mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances));
const mergedCompanyBalances = computed(() => mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances));
const mergedContractorBalances = computed(() => mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorBalances));
const mergedProjectBalances = computed(() => mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectBalances));

/* ======================= Попапы (Entity / List) ======================= */
const isEntityPopupVisible = ref(false);
const popupTitle = ref('');
const saveHandler = ref(null);
const currentWidgetIndexForReplace = ref(null); // 🟢 Индекс для замены

// Обычное добавление (для счетов, компаний и т.д.)
const openAddPopup = (title, storeAction) => {
  popupTitle.value = title;
  saveHandler.value = storeAction;
  currentWidgetIndexForReplace.value = null; // Не заменяем виджет
  isEntityPopupVisible.value = true;
};

// 🟢 НОВОЕ: Добавление КАТЕГОРИИ с заменой виджета
const openAddCategoryPopup = (title, widgetIndex) => {
  popupTitle.value = title;
  // Мы создаем обертку: сначала создаем категорию, потом меняем виджет
  saveHandler.value = async (name) => {
     const newCategory = await mainStore.addCategory(name); // Вернет объект категории
     if (newCategory && newCategory._id && widgetIndex !== null) {
         const newWidgetKey = `cat_${newCategory._id}`;
         // Заменяем виджет на месте
         mainStore.replaceWidget(widgetIndex, newWidgetKey);
     }
  };
  currentWidgetIndexForReplace.value = widgetIndex;
  isEntityPopupVisible.value = true;
};

const openRenamePopup = (title, entity, storeUpdateAction) => {
  popupTitle.value = title;
  saveHandler.value = async (newName) => {
      const updatedItem = { ...entity, name: newName };
      await mainStore.batchUpdateEntities('categories', [updatedItem]);
  };
  isEntityPopupVisible.value = true;
};

const onEntitySave = async (name) => {
  if (saveHandler.value) {
    try {
      await saveHandler.value(name);
    } catch (e) { console.error(e); }
  }
  isEntityPopupVisible.value = false;
};

const isListEditorVisible = ref(false);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);

const openEditPopup = (title, items, path) => {
  editorTitle.value = title;
  editorItems.value = JSON.parse(JSON.stringify(items));
  editorSavePath.value = path;
  isListEditorVisible.value = true;
};

const onEntityListSave = async (updatedItems) => {
  if (editorSavePath.value) {
    try { await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems); } catch (e) { console.error(e); }
  }
  isListEditorVisible.value = false;
};

/* ======================= Обработчики Категорий ======================= */
const getWidgetByKey = (key) => mainStore.allWidgets.find(w => w.key === key);

// 🟢 ИЗМЕНЕНО: Принимаем index
const onCategoryAdd = (widgetKey, index) => {
    const widget = getWidgetByKey(widgetKey);
    if (widget?.name.toLowerCase() === 'перевод') {
        isTransferPopupVisible.value = true;
    } else {
        // Открываем создание с заменой
        openAddCategoryPopup('Новая категория', index);
    }
};

const onCategoryEdit = (widgetKey) => {
    const catId = widgetKey.replace('cat_', '');
    const category = mainStore.getCategoryById(catId);
    if (category) {
        openRenamePopup(`Переименовать ${category.name}`, category, null);
    }
};

const handleTransferComplete = async (eventData) => {
    if (eventData?.dateKey) await mainStore.refreshDay(eventData.dateKey);
    isTransferPopupVisible.value = false;
};
</script>

<template>
  <div class="header-dashboard">
    <template v-for="(widgetKey, index) in mainStore.dashboardLayout" :key="index">
      
      <HeaderTotalCard
        v-if="widgetKey === 'currentTotal'"
        title="Всего (на тек. момент)"
        :totalBalance="loggedCurrentTotal" 
        :subtitlePrefix="`Всего на ${mainStore.currentAccountBalances.length} счетах`"
        :subtitleDate="`до ${todayStr}`"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'accounts'"
        title="Мои счета"
        :items="loggedAccountBalances" 
        emptyText="...счетов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый счет', mainStore.addAccount)"
        @edit="openEditPopup('Редактировать счета', mainStore.currentAccountBalances, 'accounts')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'companies'"
        title="Мои компании"
        :items="mergedCompanyBalances" emptyText="...компаний нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новая компания', mainStore.addCompany)"
        @edit="openEditPopup('Редактировать компании', mainStore.currentCompanyBalances, 'companies')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'contractors'"
        title="Мои контрагенты"
        :items="mergedContractorBalances" emptyText="...контрагентов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый контрагент', mainStore.addContractor)"
        @edit="openEditPopup('Редактировать контрагентов', mainStore.currentContractorBalances, 'contractors')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'projects'"
        title="Мои проекты"
        :items="mergedProjectBalances" emptyText="...проектов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый проект', mainStore.addProject)"
        @edit="openEditPopup('Редактировать проекты', mainStore.currentProjectBalances, 'projects')"
      />

      <HeaderTotalCard
        v-else-if="widgetKey === 'futureTotal'"
        title="Всего (с уч. будущих)"
        :totalBalance="loggedFutureTotal" 
        :subtitlePrefix="`Всего на ${mainStore.accounts.length} счетах`"
        :subtitleDate="`до ${futureUntilStr}`"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />

      <!-- 🟢 ПЕРЕДАЕМ INDEX в обработчик add -->
      <HeaderCategoryCard
        v-else-if="widgetKey.startsWith('cat_')"
        :title="getWidgetByKey(widgetKey)?.name || '...'"
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="onCategoryAdd(widgetKey, index)"
        @edit="onCategoryEdit(widgetKey)"
      />
    </template>
  </div>

  <EntityPopup
    v-if="isEntityPopupVisible"
    :title="popupTitle"
    @close="isEntityPopupVisible = false"
    @save="onEntitySave"
  />
  <EntityListEditor
    v-if="isListEditorVisible"
    :title="editorTitle"
    :items="editorItems"
    @close="isListEditorVisible = false"
    @save="onEntityListSave"
  />
  
  <TransferPopup
      v-if="isTransferPopupVisible"
      :date="new Date()"
      :cellIndex="0"
      @close="isTransferPopupVisible = false"
      @transfer-complete="handleTransferComplete"
    />

</template>

<style scoped>
.header-dashboard {
  display: flex;
  justify-content: space-between;
  background-color: var(--color-background-soft);
  padding: 1rem 1.5rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  margin-bottom: 0.4rem;
  gap: 1.5rem;
  height: 100%;
  box-sizing: border-box;
  min-height: 0; 
  width: 100%;
}
@media (max-height: 900px) {
  .header-dashboard {
    gap: 1rem;
    padding: 0.8rem 1rem;
  }
}
</style>
