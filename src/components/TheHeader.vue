<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v17.0 - TRANSFER LIST EDITOR ---
 * * ВЕРСИЯ: 17.0 - Внедрение редактора списка переводов
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (NEW) Добавлен `TransferListEditor.vue` для управления операциями перевода.
 * 2. (LOGIC) В `onCategoryEdit` теперь проверка: если это виджет "Перевод",
 * открывается `TransferListEditor` (список операций), а не переименование категории.
 * Это соответствует требованию: "Я нажимаю редактировать переводы... нахожу нужный перевод... и удаляю его".
 * 3. (FIX) Виджет "Категории" теперь использует `visibleCategories`, чтобы исключить "Перевод" из списка.
 */

console.log('--- TheHeader.vue v17.0 (Transfer List Editor) ЗАГРУЖЕН ---');

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';
// 🟢 NEW: Новый компонент редактора списка переводов
import TransferListEditor from '@/components/TransferListEditor.vue';

const mainStore = useMainStore();
const isTransferPopupVisible = ref(false);
const isTransferEditorVisible = ref(false); // 🟢 Состояние для нового окна

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
const mergedIndividualBalances = computed(() => mergeBalances(mainStore.currentIndividualBalances, mainStore.futureIndividualBalances));
const mergedCategoryBalances = computed(() => mergeBalances(mainStore.currentCategoryBalances, mainStore.futureCategoryBalances));

/* ======================= Попапы (Entity / List) ======================= */
const isEntityPopupVisible = ref(false);
const popupTitle = ref('');
const popupInitialValue = ref(''); 
const saveHandler = ref(null);
const deleteHandler = ref(null); 
const showDeleteInPopup = ref(false); 

// Обычное добавление
const openAddPopup = (title, storeAction) => {
  popupTitle.value = title;
  popupInitialValue.value = '';
  showDeleteInPopup.value = false;
  saveHandler.value = storeAction;
  deleteHandler.value = null;
  isEntityPopupVisible.value = true;
};

// Переименование + Удаление
const openRenamePopup = (title, entity, storeUpdateAction, canDelete = false, entityType = '') => {
  popupTitle.value = title;
  popupInitialValue.value = entity.name;
  showDeleteInPopup.value = canDelete; 
  
  saveHandler.value = async (newName) => {
      if (entityType) {
          const updatedItem = { ...entity, name: newName };
          await mainStore.batchUpdateEntities(entityType, [updatedItem]);
      }
  };

  if (canDelete && entityType) {
      deleteHandler.value = async ({ deleteOperations, done }) => {
          try {
             await mainStore.deleteEntity(entityType, entity._id, deleteOperations);
             isEntityPopupVisible.value = false;
          } catch (e) {
             alert('Ошибка удаления: ' + e.message);
             if(done) done();
          }
      };
  } else {
      deleteHandler.value = null;
  }

  isEntityPopupVisible.value = true;
};

const onEntitySave = async (name) => {
  if (saveHandler.value) {
    try { await saveHandler.value(name); } catch (e) { console.error(e); }
  }
  isEntityPopupVisible.value = false;
};

const onEntityDelete = (payload) => {
    if (deleteHandler.value) {
        deleteHandler.value(payload);
    }
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

const onCategoryAdd = (widgetKey, index) => {
    const widget = getWidgetByKey(widgetKey);
    if (widget?.name.toLowerCase() === 'перевод' || widget?.name.toLowerCase() === 'transfer') {
        isTransferPopupVisible.value = true;
    }
};

const onCategoryEdit = (widgetKey) => {
    const catId = widgetKey.replace('cat_', '');
    const category = mainStore.getCategoryById(catId);
    if (category) {
        const lowerName = category.name.toLowerCase();
        const isTransfer = (lowerName === 'перевод' || lowerName === 'transfer');
        
        if (isTransfer) {
            // 🟢 FIX: Для перевода открываем специальный редактор списка
            isTransferEditorVisible.value = true;
        } else {
            // Для остальных категорий - переименование
            openRenamePopup(`Категория: ${category.name}`, category, null, true, 'categories');
        }
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
        @edit="openEditPopup('Редактировать счета', mainStore.accounts, 'accounts')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'companies'"
        title="Мои компании"
        :items="mergedCompanyBalances" emptyText="...компаний нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новая компания', mainStore.addCompany)"
        @edit="openEditPopup('Редактировать компании', mainStore.companies, 'companies')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'contractors'"
        title="Мои контрагенты"
        :items="mergedContractorBalances" emptyText="...контрагентов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый контрагент', mainStore.addContractor)"
        @edit="openEditPopup('Редактировать контрагентов', mainStore.contractors, 'contractors')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'projects'"
        title="Мои проекты"
        :items="mergedProjectBalances" emptyText="...проектов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый проект', mainStore.addProject)"
        @edit="openEditPopup('Редактировать проекты', mainStore.projects, 'projects')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'individuals'"
        title="Мои Физлица"
        :items="mergedIndividualBalances" 
        emptyText="...физлиц нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новое Физлицо', mainStore.addIndividual)"
        @edit="openEditPopup('Редактировать Физлиц', mainStore.individuals, 'individuals')"
      />
      
      <!-- 🟢 FIX: Используем visibleCategories -->
      <HeaderBalanceCard
        v-else-if="widgetKey === 'categories'"
        title="Категории"
        :items="mergedCategoryBalances" 
        emptyText="...категорий нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новая категория', mainStore.addCategory)"
        @edit="openEditPopup('Редактировать категории', mainStore.visibleCategories, 'categories')"
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
    :initial-value="popupInitialValue"
    :show-delete="showDeleteInPopup"
    @close="isEntityPopupVisible = false"
    @save="onEntitySave"
    @delete="onEntityDelete"
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
    
  <!-- 🟢 NEW: Попап списка переводов -->
  <TransferListEditor
    v-if="isTransferEditorVisible"
    @close="isTransferEditorVisible = false"
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
