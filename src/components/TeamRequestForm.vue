<script setup>
import { ref, computed, onMounted, watch } from "vue";
import TeamChatDialog from "./TeamChatDialog.vue";
import TeamContractorSelect from "./TeamContractorSelect.vue";
import UiIcon from "./UiIcon.vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { formatAmountInputEvent } from "@/utils/amountInput";
const props = defineProps({ modelValue: Object, busy: Boolean, error: String });
const emit = defineEmits(["update:modelValue", "submit", "close"]);
const draft = ref({ ...props.modelValue }),
  options = ref({ projects: [], categories: [], subcategories: [] }),
  loading = ref(true),
  loadError = ref("");
const subcategories = computed(() =>
  options.value.subcategories.filter(
    (s) => s.parentCategoryId === draft.value.categoryId,
  ),
);
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  );
watch(draft, () => emit("update:modelValue", { ...draft.value }), {
  deep: true,
});
watch(
  () => draft.value.categoryId,
  () => {
    draft.value.subcategoryId = null;
  },
);
async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    options.value = (await teamApi.get("/request-options")).data;
  } catch (e) {
    loadError.value = teamError(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <TeamChatDialog title="Заявка на расход" :busy="busy" @close="emit('close')">
    <form
      class="request-create-form"
      @submit.prevent="
        emit('submit', {
          ...draft,
          title:
            draft.title.trim() ||
            options.categories.find((c) => c._id === draft.categoryId)?.name ||
            '',
        })
      "
    >
      <div class="request-create-fields team-scroll">
        <div class="request-create-amount">
          <input
            :value="draft.amount"
            @input="draft.amount = formatAmountInputEvent($event)"
            aria-label="Сумма, ₸"
            placeholder="Сумма"
            inputmode="decimal"
            required
            autofocus
          /><span>₸</span>
        </div>
        <TeamContractorSelect
          v-model="draft.contractorId"
          :fallback-name="draft.contractorName"
          @selected="draft.contractorName = $event.name"
        />
        <div class="request-create-select">
          <select
            v-model="draft.projectId"
            aria-label="Проект"
            :disabled="loading"
          >
            <option :value="null">Проект</option>
            <option v-for="p in options.projects" :key="p._id" :value="p._id">
              {{ p.name }}
            </option></select
          ><UiIcon name="chevron-down" />
        </div>
        <div class="request-create-select">
          <select
            v-model="draft.categoryId"
            aria-label="Категория"
            :disabled="loading"
          >
            <option :value="null">Категория</option>
            <option v-for="c in options.categories" :key="c._id" :value="c._id">
              {{ c.name }}
            </option></select
          ><UiIcon name="chevron-down" />
        </div>
        <div v-if="subcategories.length" class="request-create-select">
          <select v-model="draft.subcategoryId" aria-label="Подкатегория">
            <option :value="null">Подкатегория</option>
            <option v-for="s in subcategories" :key="s._id" :value="s._id">
              {{ s.name }}
            </option></select
          ><UiIcon name="chevron-down" />
        </div>
        <input
          v-model="draft.title"
          aria-label="Что оплатить / купить"
          placeholder="Что оплатить / купить"
          maxlength="300"
          :required="!draft.categoryId"
        />
        <textarea
          v-model="draft.comment"
          aria-label="Комментарий к заявке"
          placeholder="Комментарий"
          rows="2"
          maxlength="10000"
        ></textarea>
        <label class="request-create-date"
          ><span>{{ draft.dueDate > today() ? "План" : "Дата оплаты" }}</span
          ><input
            v-model="draft.dueDate"
            type="date"
            aria-label="Дата оплаты"
            required
        /></label>
        <p v-if="error || loadError" role="alert">
          {{ error || loadError
          }}<button v-if="loadError" type="button" @click="load">
            Повторить
          </button>
        </p>
      </div>
      <footer>
        <button
          class="team-request-submit"
          :disabled="busy || !draft.contractorId"
        >
          {{ busy ? "Отправляем…" : "Отправить на согласование" }}
        </button>
      </footer>
    </form>
  </TeamChatDialog>
</template>
<style scoped>
.request-create-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0;
}
.request-create-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px !important;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.request-create-form :is(input, select, textarea) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 7px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 16px;
  line-height: 22px;
}
.request-create-form :is(input, select) {
  height: 44px;
  font-size: 16px;
}
.request-create-form textarea {
  font: inherit;
  font-size: 16px;
  line-height: 22px;
  resize: vertical;
  min-height: 60px;
}
.request-create-amount {
  position: relative;
}
.request-create-amount input {
  padding-right: 36px;
}
.request-create-amount > span {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--codex-pane-muted);
}
.request-create-select {
  position: relative;
}
.request-create-select select {
  appearance: none;
  -webkit-appearance: none;
  background-image: none !important;
  padding-right: 32px !important;
}
.request-create-select > .ui-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.request-create-date {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.request-create-date input {
  width: auto;
  flex: 1;
  max-width: 220px;
}
footer {
  flex: none;
  padding: 10px 12px;
  border-top: 1px solid var(--codex-pane-border);
}
footer button {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid #168447 !important;
  border-radius: 7px;
  background: #168447 !important;
  color: #fff !important;
  font: inherit;
  cursor: pointer;
}
footer button:disabled {
  opacity: 0.5;
  cursor: default;
}
p {
  margin: 0;
  color: var(--color-danger, #c65048);
  font-size: 12px;
}
</style>
