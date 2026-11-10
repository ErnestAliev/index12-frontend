<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useTeamMedia } from "@/composables/useTeamMedia";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { fileMime, fileSize, fileDate } from "@/utils/fileLibrary";
import {
  saveDeviceFile,
  shareDeviceFile,
  canShareDeviceFile,
} from "@/utils/deviceFiles";
import TeamMediaPreview from "./TeamMediaPreview.vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ file: Object, tags: Array });
const emit = defineEmits(["close", "source", "tag", "description", "viewed"]);
const { preview, download } = useTeamMedia({ recordViews: false });
const expanded = ref(false),
  text = ref(""),
  description = ref(""),
  actionError = ref("");
const sharable = computed(
  () => preview.value?.file && canShareDeviceFile(preview.value.file),
);
let generation = 0;
async function retryPreview() {
  const ticket = ++generation,
    id = props.file.fileId;
  text.value = "";
  actionError.value = "";
  description.value = props.file.description;
  expanded.value = false;
  await download({ ...props.file, mimeType: fileMime(props.file) });
  if (ticket !== generation || preview.value?.error || !preview.value?.file)
    return;
  if (/^text\/|application\/json/.test(fileMime(props.file))) {
    const value = await preview.value.file.slice(0, 200000).text();
    if (ticket !== generation) return;
    text.value = value;
  }
  try {
    await teamApi.post("/files/library/" + id + "/view");
    if (ticket === generation) emit("viewed", id);
  } catch {
    /* Opening remains available if the view receipt fails. */
  }
}
watch(() => props.file.fileId, retryPreview, { immediate: true });
onBeforeUnmount(() => {
  ++generation;
});
watch(
  () => props.file.description,
  (value) => {
    description.value = value;
  },
);
function save() {
  try {
    if (preview.value?.file) saveDeviceFile(preview.value.file);
  } catch (error) {
    actionError.value = teamError(error);
  }
}
async function share() {
  try {
    await shareDeviceFile(preview.value.file);
  } catch (error) {
    if (error.name !== "AbortError") actionError.value = teamError(error);
  }
}
</script>
<template>
  <aside class="file-inspector" aria-label="Сведения о файле">
    <header>
      <strong :title="file.name">{{ file.name }}</strong
      ><button
        type="button"
        aria-label="Закрыть сведения о файле"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </header>
    <div class="inspector-scroll">
      <div class="inspector-preview">
        <div
          v-if="!preview?.url"
          class="preview-state"
          :role="preview?.error ? 'alert' : 'status'"
        >
          {{ preview?.error || "Загрузка…"
          }}<button v-if="preview?.error" type="button" @click="retryPreview">
            Повторить
          </button>
        </div>
        <img
        v-else-if="fileMime(file).startsWith('image/')"
          :src="preview.url"
          :alt="file.name"
          @dblclick="expanded = true"
        />
        <iframe
          v-else-if="fileMime(file) === 'application/pdf'"
          :src="preview.url"
          :title="file.name"
        />
        <video
          v-else-if="fileMime(file).startsWith('video/')"
          :src="preview.url"
          controls
          playsinline
          preload="metadata"
          :aria-label="file.name"
        />
        <audio
          v-else-if="fileMime(file).startsWith('audio/')"
          :src="preview.url"
          controls
          preload="metadata"
          :aria-label="file.name"
        />
        <pre v-else-if="text">{{ text }}</pre>
        <div v-else class="preview-state">
          <UiIcon name="file" /><span>{{ file.name }}</span>
        </div>
      </div>
      <div class="inspector-actions">
        <button type="button" :disabled="!preview?.file" @click="save">
          <UiIcon name="download" />Скачать</button
        ><button
          type="button"
          :disabled="!preview?.url"
          @click="expanded = true"
        >
          <UiIcon name="maximize" />Открыть</button
        ><button v-if="sharable" type="button" @click="share">
          <UiIcon name="share" />Поделиться
        </button>
      </div>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <dl>
        <dt>Загружен</dt>
        <dd>{{ fileDate(file.createdAt) }}</dd>
        <dt>Размер</dt>
        <dd>{{ fileSize(file.size) }}</dd>
        <dt>Загрузил</dt>
        <dd>{{ file.uploadedBy.name }}</dd>
        <dt>Проекты</dt>
        <dd>
          {{
            file.projects.map((project) => project.name).join(", ") ||
            "Без проекта"
          }}
        </dd>
      </dl>
      <label class="inspector-description"
        >Описание<textarea
          v-model="description"
          aria-label="Описание файла"
          maxlength="2000"
          :readonly="!file.canEdit"
          rows="2"
          @change="emit('description', description)"
        />
      </label>
      <section class="inspector-tags" aria-label="Метки файла">
        <h3>Метки</h3>
        <button
          v-for="tag in tags"
          :key="tag.id"
          type="button"
          :aria-pressed="file.tags.includes(tag.id)"
          :disabled="!file.canEdit"
          @click="emit('tag', tag.id)"
        >
          {{ tag.name }}
        </button>
      </section>
      <section class="file-sources" aria-label="Связанные сообщения">
        <h3>В чате</h3>
        <button
          v-for="source in file.sources"
          :key="source.kind + source.messageId"
          type="button"
          @click="emit('source', source)"
        >
          <span>{{ source.taskName || "Общий чат" }}</span
          ><small
            >{{ source.authorName }} / {{ fileDate(source.createdAt) }}</small
          ><span class="source-excerpt">{{ source.text || file.name }}</span
          ><UiIcon name="external" />
        </button>
      </section>
      <section>
        <h3>Просмотрели</h3>
        <p v-if="!file.viewedBy.length" class="file-muted">Нет просмотров</p>
        <div
          v-for="viewer in file.viewedBy"
          :key="viewer.actorId"
          class="file-viewer"
        >
          {{ viewer.name }}<small>{{ fileDate(viewer.lastViewedAt) }}</small>
        </div>
      </section>
    </div>
    <TeamMediaPreview
      v-if="expanded && preview"
      :media="preview"
      @close="expanded = false"
      @retry="retryPreview"
    />
  </aside>
</template>
<style scoped>
.file-inspector {
  width: auto;
  flex: none;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-background);
}
.file-inspector header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex: none;
  border-bottom: 1px solid var(--color-border);
}
header strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}
.file-inspector button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
header button {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
}
.inspector-scroll {
  overflow: auto;
  padding: 12px;
  min-height: 0;
}
.inspector-preview {
  height: clamp(240px, 68cqh, 1000px);
  background: var(--color-background-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.inspector-preview :is(img, video, iframe) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border: 0;
}
.inspector-preview audio {
  max-width: 100%;
}
.inspector-preview pre {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 10px;
  box-sizing: border-box;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
}
.preview-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  text-align: center;
  overflow-wrap: anywhere;
}
.preview-state > .ui-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}
.inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-block: 8px;
}
.inspector-actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px;
  min-height: 36px;
  background: transparent;
  border: 0;
  font-size: 12px;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  font-size: 12px;
}
dt {
  color: var(--color-text-secondary, var(--color-text));
  opacity: 0.7;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.inspector-description {
  display: grid;
  gap: 6px;
  font-size: 12px;
}
.inspector-description textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  border-radius: 5px;
  padding: 8px;
  color: inherit;
  font: inherit;
}
h3 {
  font-size: 12px;
  font-weight: 500;
  margin: 16px 0 8px;
}
.inspector-tags button {
  min-height: 30px;
  margin: 0 4px 4px 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
}
.inspector-tags [aria-pressed="true"] {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-background-soft);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.file-sources button {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 28px 8px 0;
  min-height: 44px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  font-size: 12px;
}
.file-sources small,
.file-viewer small {
  font-size: 11px;
  opacity: 0.65;
}
.file-sources .ui-icon {
  position: absolute;
  right: 0;
  top: 12px;
}
.source-excerpt {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.file-viewer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 12px;
}
.file-muted {
  font-size: 12px;
  opacity: 0.6;
}
@media (max-width: 700px) {
  .file-inspector {
    position: absolute;
    inset: 0;
    width: auto;
    border-left: 0;
    z-index: 5;
  }
  .inspector-preview {
    height: max(240px, 55cqh);
  }
  header button,
  .inspector-actions button {
    min-height: 44px;
  }
}
</style>

<style scoped>
@media (max-width: 700px) {
  .inspector-description textarea {
    font-size: 16px;
  }
  .inspector-tags button {
    min-height: 44px;
  }
  .inspector-scroll {
    padding-bottom: max(12px, var(--safe-bottom-controls, 12px));
    padding-left: max(12px, var(--safe-area-left, 0px));
    padding-right: max(12px, var(--safe-area-right, 0px));
  }
}
</style>
