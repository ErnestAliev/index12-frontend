<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { accountSuggestions } from '@/data/accountSuggestions.js';
import { categorySuggestions } from '@/data/categorySuggestions.js';
import { knownBanks } from '@/data/knownBanks.js';

/**
 * * --- МЕТКА ВЕРСИИ: v4.2 - AUTOCOMPLETE FIX ---
 * * ВЕРСИЯ: 4.2
 * * ДАТА: 2025-12-04
 * * ИЗМЕНЕНИЯ:
 * 1. (FIX) Добавлен флаг isProgrammaticUpdate, чтобы список не открывался заново после выбора подсказки.
 */

const props = defineProps({
  title: { type: String, required: true },
  initialValue: { type: String, default: '' },
  showDelete: { type: Boolean, default: false },
  entityType: { type: String, default: '' } // 'account', 'category', 'contractor' и т.д.
});

const emit = defineEmits(['close', 'save', 'delete']);
const inputValue = ref(props.initialValue);

// --- ЛОГИКА УДАЛЕНИЯ ---
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);

const handleDeleteClick = () => { showDeleteConfirm.value = true; };
const confirmDelete = (deleteOperations) => { isDeleting.value = true; emit('delete', { deleteOperations, done: () => { isDeleting.value = false; } }); };
const cancelDelete = () => { if (isDeleting.value) return; showDeleteConfirm.value = false; };

// --- ЛОГИКА АВТОПОДСТАНОВКИ ---
const showSuggestions = ref(false);
const inputRef = ref(null);
// 🟢 Флаг для блокировки открытия списка при выборе подсказки
const isProgrammaticUpdate = ref(false);

const suggestionsList = computed(() => {
    const query = inputValue.value.trim().toLowerCase();
    if (query.length < 2) return [];
    
    let source = [];
    // Выбираем источник данных в зависимости от типа сущности
    if (props.entityType === 'account') source = accountSuggestions;
    else if (props.entityType === 'category') source = categorySuggestions;
    else if (props.entityType === 'contractor') source = knownBanks;
    else return [];

    return source.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(query);
        const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
        return nameMatch || keywordMatch;
    }).slice(0, 4); // Показываем топ-4
});

const selectSuggestion = (item) => {
    // 🟢 1. Ставим флаг перед изменением значения
    isProgrammaticUpdate.value = true;
    inputValue.value = item.name;
    showSuggestions.value = false;
    
    nextTick(() => {
        inputRef.value?.focus();
        // 🟢 2. Сбрасываем флаг после обновления DOM
        isProgrammaticUpdate.value = false;
    });
};

const handleBlur = () => { setTimeout(() => { showSuggestions.value = false; }, 200); };
const handleFocus = () => { if (inputValue.value.length >= 2) showSuggestions.value = true; };

watch(inputValue, (val) => {
    if (props.showDelete) return; // При редактировании (есть кнопка удаления) подсказки не нужны
    
    // 🟢 3. Если изменение программное (выбор из списка), не открываем список снова
    if (isProgrammaticUpdate.value) return;

    showSuggestions.value = val.length >= 2;
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    
    <div class="popup-content">
      <h3>{{ title }}</h3>
      
      <p class="editor-hint">
        Введите новое название. {{ showDelete ? 'Нажмите на корзину для удаления.' : '' }}
      </p>
      
      <div class="single-field-wrapper">
          <label class="field-label">Название</label>
          
          <div class="field-row relative">
              <input 
                type="text" 
                v-model="inputValue" 
                placeholder="Введите название..." 
                class="popup-input"
                ref="inputRef"
                @keyup.enter="$emit('save', inputValue)"
                @blur="handleBlur"
                @focus="handleFocus"
              />
              
              <button v-if="showDelete" class="btn-delete" @click="handleDeleteClick" title="Удалить">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="3 6 5 6 21 6"></polyline>
                     <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
              </button>

              <!-- 🟢 Список подсказок -->
              <ul v-if="showSuggestions && suggestionsList.length > 0" class="suggestions-list">
                  <li v-for="(item, idx) in suggestionsList" :key="idx" @mousedown.prevent="selectSuggestion(item)">
                      {{ item.name }}
                  </li>
              </ul>
          </div>
      </div>
          
      <div class="popup-actions">
        <button @click="$emit('save', inputValue)" class="btn-submit">
          Сохранить
        </button>
      </div>
    </div>

    <!-- ВСТРОЕННЫЙ МОДАЛ УДАЛЕНИЯ -->
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        <div v-if="isDeleting" class="deleting-state">
           <h4>Удаление...</h4>
           <p class="sub-note">Пожалуйста, подождите, обновляем данные.</p>
           <div class="progress-container"><div class="progress-bar"></div></div>
        </div>
        <div v-else>
          <h4>Удаление сущности</h4>
          <p>
            Вы собираетесь удалить <strong>«{{ inputValue }}»</strong>.<br>
            Что делать со связанными операциями?
          </p>
          <div class="delete-actions">
             <button class="btn-choice btn-keep" @click="confirmDelete(false)">
                <span class="main-text">Только сущность</span>
                <span class="sub-text">Операции останутся (связь исчезнет)</span>
             </button>
             <button class="btn-choice btn-nuke" @click="confirmDelete(true)">
                <span class="main-text">Сущность + Операции</span>
                <span class="sub-text">Удалится всё безвозвратно</span>
             </button>
          </div>
          <button class="btn-cancel" @click="cancelDelete">Отмена</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.popup-content { max-width: 580px; background: #F4F4F4; padding: 2rem; border-radius: 12px; color: #1a1a1a; width: 100%; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 1rem; position: relative; }
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 0.5rem; font-size: 22px; font-weight: 600; text-align: left; }
.editor-hint { font-size: 0.9em; color: #666; text-align: left; margin-top: 0; margin-bottom: 1.5rem; }
.single-field-wrapper { margin-bottom: 2rem; }
.field-label { display: block; font-size: 0.85em; color: #666; margin-bottom: 8px; margin-left: 2px; }
.field-row { display: flex; gap: 10px; align-items: center; }
.popup-input { flex-grow: 1; height: 48px; padding: 0 14px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; font-size: 15px; box-sizing: border-box; color: #1a1a1a; margin-bottom: 0; }
.popup-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2); }
.popup-actions { display: flex; justify-content: flex-end; }
.btn-submit { width: 100%; height: 50px; background-color: #222; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; }
.btn-submit:hover { background-color: #444; }
.btn-delete { width: 48px; height: 48px; flex-shrink: 0; border: 1px solid #E0E0E0; background: #fff; border-radius: 8px; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
.btn-delete svg { stroke: #999; transition: stroke 0.2s; display: block; }
.btn-delete:hover { border-color: #FF3B30; background: #fff5f5; }
.btn-delete:hover svg { stroke: #FF3B30; }
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10; }
.delete-confirm-box { background: #fff; padding: 20px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); text-align: center; }
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.delete-confirm-box p { color: #555; font-size: 14px; margin-bottom: 20px; line-height: 1.4; }
.delete-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
.btn-choice { border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: 12px; cursor: pointer; text-align: left; display: flex; flex-direction: column; transition: border-color 0.2s, background 0.2s; }
.btn-choice:hover { border-color: #aaa; background: #f9f9f9; }
.btn-choice .main-text { font-weight: 600; color: #333; font-size: 15px; margin-bottom: 2px; }
.btn-choice .sub-text { font-size: 12px; color: #888; }
.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; }
.btn-nuke .main-text { color: #FF3B30; }
.btn-cancel { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline; }
.btn-cancel:hover { color: #555; }
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container { width: 100%; height: 6px; background-color: #eee; border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar { width: 100%; height: 100%; background-color: #222; position: absolute; left: -100%; animation: indeterminate 1.5s infinite ease-in-out; }
@keyframes indeterminate { 0% { left: -100%; width: 50%; } 50% { left: 25%; width: 50%; } 100% { left: 100%; width: 50%; } }

/* 🟢 СТИЛИ ДЛЯ СПИСКА */
.relative { position: relative; }
.suggestions-list { position: absolute; top: 100%; left: 0; right: 48px; /* Учитываем кнопку удаления справа */ background: #fff; border: 1px solid #E0E0E0; border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); z-index: 2000; list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; }
.suggestions-list li { padding: 10px 14px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.suggestions-list li:last-child { border-bottom: none; }
.suggestions-list li:hover { background-color: #f9f9f9; }
</style>