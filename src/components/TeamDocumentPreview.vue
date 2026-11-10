<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { documentFormat } from "@/utils/documentFormats";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ file: Object, name: String });
const model = ref(null),
  current = ref(null),
  sheetIndex = ref(0),
  loading = ref(false),
  error = ref(""),
  zoom = ref(100);
const sheet = computed(() => model.value?.sheets?.[sheetIndex.value]);
let worker,
  timer,
  ticket = 0,
  disposed = false;
function stop() {
  worker?.terminate();
  worker = null;
  clearTimeout(timer);
}
function send(action, values, transfer = []) {
  const id = ++ticket;
  loading.value = true;
  error.value = "";
  clearTimeout(timer);
  timer = setTimeout(() => {
    stop();
    loading.value = false;
    error.value = "Не удалось открыть документ за отведённое время";
  }, 15000);
  worker.postMessage({ id, action, ...values }, transfer);
}
async function open() {
  stop();
  const id = ++ticket;
  model.value = null;
  current.value = null;
  sheetIndex.value = 0;
  error.value = "";
  loading.value = true;
  try {
    const bytes = await props.file.arrayBuffer();
    if (disposed || id !== ticket) return;
    worker = new Worker(
      new URL("../workers/documentPreview.worker.js", import.meta.url),
      { type: "module" },
    );
    const currentWorker = worker;
    worker.onmessage = (event) => {
      if (disposed || event.data.id !== ticket) return;
      clearTimeout(timer);
      loading.value = false;
      if (event.data.error) {
        error.value = event.data.error;
        return;
      }
      const result = event.data.result;
      if (result.kind) {
        model.value = result;
        current.value = result.page || null;
      } else current.value = result;
    };
    worker.onerror = () => {
      if (disposed || worker !== currentWorker) return;
      stop();
      loading.value = false;
      error.value = "Не удалось прочитать документ";
    };
    send(
      "parse",
      {
        bytes,
        format: documentFormat({
          name: props.name || props.file.name,
          mimeType: props.file.type,
        }),
      },
      [bytes],
    );
  } catch {
    if (id === ticket) {
      loading.value = false;
      error.value = "Не удалось прочитать документ";
    }
  }
}
function selectSheet(index) {
  if (!worker) return;
  sheetIndex.value = index;
  current.value = null;
  send("page", { index, offset: 0 });
}
function move(direction) {
  if (worker && current.value)
    send("page", {
      index: sheetIndex.value,
      offset: current.value.offset + direction * 100,
    });
}
watch(() => props.file, open, { immediate: true });
onBeforeUnmount(() => {
  disposed = true;
  ++ticket;
  stop();
});
</script>
<template>
  <section
    class="document-preview"
    aria-label="Просмотр документа"
    :aria-busy="loading"
    :style="{ '--document-zoom': zoom / 100 }"
  >
    <div v-if="error" class="document-state" role="alert">
      <span>{{ error }}</span
      ><button type="button" @click="open">Повторить</button>
    </div>
    <div v-else-if="!model" class="document-state" role="status">
      Чтение документа…
    </div>
    <template v-else>
      <div
        v-if="model.kind === 'workbook'"
        class="document-sheets"
        role="tablist"
        aria-label="Листы таблицы"
      >
        <button
          v-for="(item, index) in model.sheets"
          :key="index"
          type="button"
          role="tab"
          :aria-selected="index === sheetIndex"
          :disabled="loading"
          @click="selectSheet(index)"
        >
          {{ item.name }}
        </button>
      </div>
      <div class="document-toolbar">
        <span v-if="sheet" class="document-count"
          >{{ current?.rows.length ? current.offset + 1 : 0 }}–{{
            current ? current.offset + current.rows.length : 0
          }}
          / {{ sheet.rows }}</span
        ><span v-if="loading" role="status">Загрузка…</span
        ><span class="document-zoom"
          ><button
            type="button"
            aria-label="Уменьшить текст документа"
            :disabled="zoom <= 80"
            @click="zoom -= 10"
          >
            <UiIcon name="minus" /></button
          ><span>{{ zoom }}%</span
          ><button
            type="button"
            aria-label="Увеличить текст документа"
            :disabled="zoom >= 180"
            @click="zoom += 10"
          >
            <UiIcon name="plus" /></button></span
        ><template v-if="sheet"
          ><button
            type="button"
            aria-label="Предыдущие строки"
            :disabled="loading || !current || current.offset === 0"
            @click="move(-1)"
          >
            <UiIcon name="chevron-left" /></button
          ><button
            type="button"
            aria-label="Следующие строки"
            :disabled="
              loading || !current || current.offset + 100 >= sheet.rows
            "
            @click="move(1)"
          >
            <UiIcon name="chevron-right" /></button
        ></template>
      </div>
      <p
        v-if="model.limited || sheet?.limited"
        class="document-limit"
        role="status"
      >
        Предпросмотр ограничен размером документа<template v-if="sheet"
          >: до 20 000 строк и 200 столбцов</template
        >
      </p>
      <div
        class="document-content"
        tabindex="0"
        aria-label="Содержимое документа"
      >
        <template v-if="model.kind === 'workbook'"
          ><table v-if="current?.rows.length" class="spreadsheet-table">
            <thead>
              <tr>
                <th class="row-number" />
                <th v-for="column in current.columns" :key="column" scope="col">
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in current.rows" :key="row.number">
                <th class="row-number" scope="row">{{ row.number }}</th>
                <td
                  v-for="cell in row.cells"
                  :key="cell.column"
                  :rowspan="cell.rowSpan"
                  :colspan="cell.colSpan"
                  :title="cell.text"
                >
                  {{ cell.text }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!loading" class="document-empty">Лист пуст</p></template
        >
        <article v-else-if="model.kind === 'document'" class="reading-document">
          <template v-for="(block, index) in model.blocks" :key="index"
            ><table v-if="block.kind === 'table'" class="document-table">
              <tbody>
                <tr v-for="(row, i) in block.rows" :key="i">
                  <td v-for="(text, j) in row" :key="j">{{ text }}</td>
                </tr>
              </tbody>
            </table>
            <component :is="block.heading ? 'h' + block.heading : 'p'" v-else>{{
              block.text || "\u00a0"
            }}</component></template
          >
          <p v-if="!model.blocks.length" class="document-empty">
            Документ пуст
          </p>
        </article>
        <pre v-else class="reading-text">{{ model.text || "Файл пуст" }}</pre>
      </div>
    </template>
  </section>
</template>
<style scoped>
.document-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  color: var(--color-text);
  background: var(--color-background);
  font-size: 13px;
  overflow: hidden;
  text-align: left;
}
.document-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  text-align: center;
  font-size: 13px;
}
.document-state button,
.document-toolbar button,
.document-sheets button {
  font: inherit;
  color: inherit;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.document-state button {
  min-height: 44px;
  padding: 6px 10px;
}
.document-sheets {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  overflow-x: auto;
  flex: none;
  border-bottom: 1px solid var(--color-border);
}
.document-sheets button {
  flex: none;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.document-sheets [aria-selected="true"] {
  background: var(--color-background-soft);
  color: var(--color-primary);
}
.document-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 6px;
  flex: none;
  border-bottom: 1px solid var(--color-border);
  font-size: 11px;
}
.document-toolbar button {
  display: grid;
  place-items: center;
  width: 32px;
  min-height: 36px;
  flex: none;
}
.document-toolbar button:disabled {
  opacity: 0.3;
  cursor: default;
}
.document-count {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.document-zoom {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.document-zoom span {
  min-width: 32px;
  text-align: center;
}
.document-limit {
  padding: 6px 10px;
  margin: 0;
  font-size: 11px;
  flex: none;
  color: var(--color-text);
  background: var(--color-background-soft);
}
.document-content {
  overflow: auto;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overscroll-behavior: contain;
  outline: none;
  user-select: text;
  -webkit-user-select: text;
}
.spreadsheet-table {
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
  font-size: calc(12px * var(--document-zoom));
  line-height: 1.4;
}
.spreadsheet-table :is(th, td) {
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  padding: 5px 8px;
  min-width: 90px;
  max-width: 360px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  vertical-align: top;
}
.spreadsheet-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--color-background-soft);
  font-weight: 500;
  text-align: center;
}
.spreadsheet-table .row-number {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 28px;
  max-width: 50px;
  background: var(--color-background-soft);
  font-size: 11px;
  font-weight: 400;
  text-align: right;
}
.spreadsheet-table thead .row-number {
  z-index: 3;
}
.reading-document {
  padding: 14px 18px;
  max-width: 850px;
  margin-inline: auto;
  font-size: calc(14px * var(--document-zoom));
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.reading-document p {
  margin: 0 0 10px;
  white-space: pre-wrap;
}
.reading-document :is(h1, h2, h3, h4, h5, h6) {
  line-height: 1.35;
  margin: 14px 0 10px;
  font-weight: 600;
}
.reading-document h1 {
  font-size: 1.5em;
}
.reading-document h2 {
  font-size: 1.3em;
}
.reading-document :is(h3, h4, h5, h6) {
  font-size: 1.1em;
}
.document-table {
  border-collapse: collapse;
  min-width: 100%;
  margin: 12px 0;
}
.document-table td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  white-space: pre-wrap;
  vertical-align: top;
  min-width: 70px;
}
.reading-text {
  margin: 0;
  padding: 14px;
  font-family: inherit;
  font-size: calc(13px * var(--document-zoom));
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.document-empty {
  margin: 16px;
  font-size: 13px;
  opacity: 0.65;
}
@media (pointer: coarse) {
  .document-toolbar button,
  .document-sheets button {
    min-height: 44px;
  }
  .document-toolbar button {
    width: 40px;
  }
  .document-toolbar {
    min-height: 44px;
  }
}
</style>
