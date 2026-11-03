<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useMainStore } from "@/stores/mainStore";
import { useAppearanceStore } from "@/stores/appearanceStore";
import {
  historyRequest,
  historyDeviceId,
  preferenceValue,
  applyPreferenceUndo,
  flushPreferenceHistory,
  recoverPreferenceUndo,
} from "@/utils/preferenceHistory.js";
import {
  historyTitle,
  historyLines,
  dateText,
  money,
  operationNames,
} from "@/utils/historyDisplay.js";
const emit = defineEmits(["close"]);
const store = useMainStore(),
  appearance = useAppearanceStore();
const panel = ref(null),
  rows = ref([]),
  cursor = ref(null),
  loading = ref(false),
  error = ref(""),
  syncError = ref(""),
  busy = ref(false),
  confirmation = ref(null),
  confirmBox = ref(null),
  tooltip = ref(null);
const kind = ref(""),
  type = ref(""),
  from = ref(""),
  to = ref(""),
  order = ref("desc");
let generation = 0,
  returnFocus,
  undoFocus;
async function load(more = false) {
  const ticket = ++generation;
  loading.value = true;
  error.value = "";
  tooltip.value = null;
  try {
    if (!more) {
      await flushPreferenceHistory();
      await recoverPreferenceUndo();
    }
    const query = new URLSearchParams({
      kind: kind.value,
      operationType: kind.value === "setting" ? "" : type.value,
      order: order.value,
      limit: "50",
    });
    if (from.value)
      query.set("from", new Date(`${from.value}T00:00:00`).toISOString());
    if (to.value)
      query.set("to", new Date(`${to.value}T23:59:59.999`).toISOString());
    if (more && cursor.value) query.set("cursor", cursor.value);
    const result = await historyRequest(`?${query}`);
    if (ticket !== generation) return;
    rows.value = more ? [...rows.value, ...result.items] : result.items;
    cursor.value = result.nextCursor;
  } catch (e) {
    if (ticket === generation) error.value = e.message;
  } finally {
    if (ticket === generation) loading.value = false;
  }
}
watch([kind, type, from, to, order], () => load());
function reason(row) {
  return row.undoneAt
    ? "Изменение отменено"
    : row.pending
      ? "Отмена ожидает подтверждения устройства"
      : !row.canUndo
        ? "Нет прав на отмену"
        : row.target === "preference" && row.deviceId !== historyDeviceId
          ? "Настройка относится к другому устройству"
          : "";
}
async function askUndo(row, event) {
  undoFocus = event.currentTarget;
  confirmation.value = row;
  tooltip.value = null;
  await nextTick();
  confirmBox.value?.focus();
}
function cancel() {
  if (busy.value) return;
  confirmation.value = null;
  undoFocus?.focus();
}
async function undo() {
  const row = confirmation.value;
  if (!row || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const body = { confirm: true, deviceId: historyDeviceId };
    if (row.target === "preference") body.current = preferenceValue(row.key);
    if (row.kind === "operation") {
      await store.undoOperationChange(row, () =>
        historyRequest(`/${row.id}/undo`, "POST", body),
      );
    } else {
      const result = await historyRequest(`/${row.id}/undo`, "POST", body);
      if (result.preference) await applyPreferenceUndo(result.preference);
      else await appearance.refreshLibrary();
    }
    confirmation.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
    confirmation.value = null;
    await loadAfterError(e.message);
  } finally {
    busy.value = false;
    undoFocus?.focus();
  }
}
async function loadAfterError(message) {
  await load();
  error.value = message;
}
function showDetails(row, event) {
  if (row.kind !== "operation") return;
  const r = event.currentTarget.getBoundingClientRect();
  const names = { ...row.details };
  const name = (id) => row.entities?.[String(id)] || String(id);
  if (row.snapshot.categoryIds?.length)
    names.categoryId = row.snapshot.categoryIds.map(name).join(", ");
  if (row.snapshot.splitMeta?.length)
    names.projectId = row.snapshot.splitMeta
      .map((s) => name(s.projectId))
      .join(", ");
  tooltip.value = {
    row,
    names,
    left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - 328)),
    top: Math.min(r.bottom + 8, Math.max(8, window.innerHeight - 330)),
  };
}
function keydown(event) {
  if (event.key === "Escape") {
    event.stopPropagation();
    if (confirmation.value) cancel();
    else emit("close");
  }
  if (event.key === "Tab") {
    const root = confirmation.value ? confirmBox.value : panel.value,
      items = [
        ...root.querySelectorAll(
          'button:not(:disabled),input,select,[tabindex="0"]',
        ),
      ].filter((n) => n.getClientRects().length);
    if (!items.length) return;
    const first = items[0],
      last = items.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === root)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
function syncState(event) {
  syncError.value = event.detail.error || "";
}
onMounted(async () => {
  window.addEventListener("index12:history-state", syncState);
  returnFocus = document.activeElement;
  panel.value?.focus();
  await load();
});
onBeforeUnmount(() => {
  window.removeEventListener("index12:history-state", syncState);
  generation++;
  returnFocus?.focus?.({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <div
      class="history-overlay"
      @click.self="!busy && emit('close')"
      @keydown="keydown"
    >
      <section
        ref="panel"
        class="history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        tabindex="-1"
        :inert="confirmation ? true : undefined"
      >
        <header>
          <h2 id="history-title">История изменений</h2>
          <button
            type="button"
            :disabled="busy"
            title="Обновить"
            aria-label="Обновить историю"
            @click="load()"
          >
            ↻</button
          ><button
            type="button"
            :disabled="busy"
            aria-label="Закрыть историю"
            @click="emit('close')"
           class="ui-icon-button"><UiIcon name="close" /></button>
        </header>
        <div class="history-filters">
          <label
            >Раздел<select v-model="kind" aria-label="Раздел" class="ui-select">
              <option value="">Все изменения</option>
              <option value="operation">Операции</option>
              <option value="setting">Настройки системы и окон</option>
            </select></label
          >
          <label v-if="kind !== 'setting'"
            >Тип<select v-model="type" aria-label="Тип операции" class="ui-select">
              <option value="">Все операции</option>
              <option
                v-for="(name, key) in operationNames"
                :key="key"
                :value="key"
              >
                {{ name }}
              </option>
            </select></label
          >
          <label
            >С даты<input
              v-model="from"
              aria-label="С даты"
              type="date" /></label
          ><label
            >По дату<input v-model="to" aria-label="По дату" type="date"
          /></label>
          <label
            >Порядок<select v-model="order" aria-label="Порядок" class="ui-select">
              <option value="desc">Сначала новые</option>
              <option value="asc">Сначала старые</option>
            </select></label
          >
        </div>
        <p v-if="error || syncError" class="history-error" role="alert">
          {{ error || syncError }}
        </p>
        <div class="history-list" :aria-busy="loading" @scroll="tooltip = null">
          <article
            v-for="row in rows"
            :key="row.id"
            class="history-row"
            :class="{ undone: row.undoneAt }"
            :data-history-id="row.id"
          >
            <div class="history-when">
              <time :datetime="row.createdAt">{{
                dateText(row.createdAt, true)
              }}</time
              ><span
                >{{ row.actorName
                }}<template v-if="row.deviceLabel">
                  · {{ row.deviceLabel }}</template
                ></span
              >
            </div>
            <div class="history-content">
              <button
                v-if="row.kind === 'operation'"
                type="button"
                class="history-type"
                :class="row.operationType"
                @mouseenter="showDetails(row, $event)"
                @mouseleave="tooltip = null"
                @focus="showDetails(row, $event)"
                @blur="tooltip = null"
                @click="showDetails(row, $event)"
              >
                {{ historyTitle(row) }}
              </button>
              <strong v-else>{{ historyTitle(row) }}</strong>
              <div
                v-for="(line, i) in historyLines(row)"
                :key="i"
                class="history-change"
              >
                <span v-if="line.label" class="history-field"
                  >{{ line.label }}: </span
                ><span>{{ line.before }}</span
                ><template v-if="line.after"
                  ><span class="history-arrow" aria-label="изменено на">
                    → </span
                  ><i
                    v-if="line.color"
                    :style="{ background: line.color }"
                    aria-hidden="true"
                  /><span>{{ line.after }}</span></template
                >
              </div>
            </div>
            <button
              type="button"
              class="history-undo"
              :disabled="busy || !!reason(row)"
              :title="reason(row) || 'Отменить только это изменение'"
              @click="askUndo(row, $event)"
            >
              {{ row.undoneAt ? "Отменено" : "Отменить" }}
            </button>
          </article>
          <p v-if="!rows.length && !loading && !error" class="history-empty">
            Изменений пока нет
          </p>
          <p v-if="loading" class="history-empty" role="status">Загрузка…</p>
          <button
            v-if="cursor && !loading"
            type="button"
            class="history-more"
            @click="load(true)"
          >
            Ещё 50
          </button>
        </div>
      </section>
      <div
        v-if="confirmation"
        class="history-confirm-overlay"
        @click.self="cancel"
      >
        <section
          ref="confirmBox"
          class="history-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="history-confirm-title"
          aria-describedby="history-confirm-detail"
          tabindex="-1"
        >
          <h3 id="history-confirm-title">
            Вы уверены, что хотите отменить это изменение?
          </h3>
          <div id="history-confirm-detail">
            <strong>{{ historyTitle(confirmation) }}</strong>
            <p v-for="(line, i) in historyLines(confirmation)" :key="i">
              {{ line.label }} {{ line.before
              }}<template v-if="line.after"> → {{ line.after }}</template>
            </p>
          </div>
          <footer>
            <button type="button" :disabled="busy" @click="cancel">
              Отмена</button
            ><button
              type="button"
              class="confirm-undo"
              :disabled="busy"
              @click="undo"
            >
              {{ busy ? "Отмена изменения…" : "Да, отменить изменение" }}
            </button>
          </footer>
        </section>
      </div>
      <aside
        v-if="tooltip"
        class="history-tooltip"
        role="tooltip"
        :style="{ left: tooltip.left + 'px', top: tooltip.top + 'px' }"
      >
        <strong
          >{{ historyTitle(tooltip.row) }} ·
          {{ money(tooltip.row.snapshot.amount) }} ₸</strong
        >
        <div>{{ dateText(tooltip.row.snapshot.date) }}</div>
        <dl>
          <template
            v-for="(label, key) in {
              accountId: 'Счёт',
              fromAccountId: 'Откуда',
              toAccountId: 'Куда',
              companyId: 'Владелец',
              individualId: 'Владелец',
              categoryId: 'Категория',
              subcategoryId: 'Подкатегория',
              contractorId: 'Контрагент',
              counterpartyIndividualId: 'Контрагент',
              projectId: 'Проект',
            }"
            :key="key"
            ><template v-if="tooltip.names?.[key]"
              ><dt>{{ label }}</dt>
              <dd>{{ tooltip.names[key] }}</dd></template
            ></template
          ><template v-if="tooltip.row.snapshot.projectScope === 'all'"
            ><dt>Проект</dt>
            <dd>Все проекты</dd></template
          >
        </dl>
        <p v-if="tooltip.row.snapshot.description">
          {{ tooltip.row.snapshot.description }}
        </p>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 21000;
  background: #0005;
  display: flex;
  justify-content: flex-end;
  padding: 16px 60px 16px 16px;
  color: var(--color-text, #263631);
  font:
    13px -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
.history-panel {
  display: flex;
  flex-direction: column;
  width: min(920px, 100%);
  min-width: 0;
  max-height: 100%;
  background: var(--color-background-soft, #fff);
  border: 1px solid var(--color-border, #ccd5d1);
  border-radius: 12px;
  box-shadow: 0 12px 48px #0003;
  overflow: hidden;
  outline: none;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #ccd5d1);
}
h2 {
  font-size: 17px;
  margin: 0 auto 0 0;
}
header button {
  font-size: 23px;
  width: 32px;
  padding: 0;
}
button,
input,
select {
  font: inherit;
  color: inherit;
  background: var(--color-background, #f4f6f5);
  border: 1px solid var(--color-border, #ccd5d1);
  border-radius: 6px;
  padding: 7px 10px;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--color-primary, #3b6763);
  outline-offset: 2px;
}
.history-filters {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  flex-wrap: wrap;
}
.history-filters label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
}
.history-filters select,
.history-filters input {
  max-width: 100%;
  min-width: 0;
  font-size: 12px;
}
.history-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.history-row {
  display: grid;
  grid-template-columns: 145px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 14px 18px;
  border-top: 1px solid var(--color-border, #ccd5d1);
}
.history-when {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
}
.history-when span {
  opacity: 0.65;
  overflow-wrap: anywhere;
}
.history-content {
  min-width: 0;
  overflow-wrap: anywhere;
}
.history-type {
  padding: 0;
  border: 0;
  background: transparent;
  font-weight: 650;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 4px;
  margin-bottom: 4px;
}
.history-type.income {
  color: var(--graph-line-income, #25734f);
}
.history-type.expense {
  color: var(--graph-line-expense, #a74439);
}
.history-type.transfer {
  color: var(--appearance-global-transfer, var(--op-transfer-color, #4b6077));
}
.history-change {
  margin-top: 5px;
  line-height: 1.5;
}
.history-field,
.history-arrow {
  opacity: 0.65;
}
.history-change i {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 3px;
  border: 1px solid #8888;
  margin-right: 4px;
}
.history-undo {
  font-size: 12px;
}
.undone .history-content {
  opacity: 0.6;
}
.history-empty {
  padding: 22px;
  text-align: center;
  opacity: 0.7;
}
.history-more {
  display: block;
  margin: 12px auto;
}
.history-error {
  color: var(--graph-line-expense, #a74439);
  margin: 4px 18px 12px;
  line-height: 1.5;
}
.history-confirm-overlay {
  position: fixed;
  inset: 0;
  background: #0007;
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 2;
}
.history-confirm {
  max-width: 480px;
  max-height: 90dvh;
  overflow: auto;
  background: var(--color-background-soft, #fff);
  border: 1px solid var(--color-border, #ccd5d1);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 48px #0003;
  outline: none;
}
.history-confirm h3 {
  margin: 0 0 18px;
  font-size: 17px;
  line-height: 1.5;
}
.history-confirm p {
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.history-confirm footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  flex-wrap: wrap;
}
.confirm-undo {
  background: var(--color-primary, #3b6763);
  color: var(--btn-widget-color-active, #fff);
}
.history-tooltip {
  position: fixed;
  z-index: 3;
  width: 310px;
  max-width: calc(100vw - 16px);
  max-height: 320px;
  overflow: auto;
  pointer-events: none;
  box-sizing: border-box;
  padding: 14px;
  background: var(--color-background-soft, #fff);
  border: 1px solid var(--color-border, #ccd5d1);
  border-radius: 8px;
  box-shadow: 0 5px 24px #0003;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.history-tooltip dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 10px;
  margin: 10px 0 0;
}
.history-tooltip dt {
  opacity: 0.65;
}
.history-tooltip dd {
  margin: 0;
}
.history-tooltip p {
  margin-bottom: 0;
}
@media (max-width: 650px) {
  .history-overlay {
    padding: 8px;
  }
  .history-panel {
    width: 100%;
  }
  .history-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 12px;
  }
  .history-when {
    grid-column: 1/-1;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .history-filters {
    padding: 12px;
    gap: 8px;
  }
  .history-filters label {
    flex: 1 1 42%;
    min-width: 0;
  }
  .history-filters select {
    width: 100%;
  }
  .history-content {
    font-size: 12px;
  }
}
</style>
