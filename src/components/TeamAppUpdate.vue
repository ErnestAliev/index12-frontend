<script setup>
import { computed, onMounted } from "vue";
import { useAppUpdateStore } from "@/stores/appUpdateStore";
import { useTeamChatStore } from "@/stores/teamChatStore";
import {
  pendingTeamDestination,
  completeTeamDestination,
} from "@/utils/teamDestination";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ inline: Boolean });
const updates = useAppUpdateStore(),
  chat = useTeamChatStore();
const date = computed(() =>
  updates.latest
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Almaty",
      }).format(new Date(updates.latest.builtAt))
    : "",
);
onMounted(() => {
  if (!props.inline) {
    void updates.check(true);
    const target = pendingTeamDestination();
    if (target?.releaseVersion)
      requestAnimationFrame(() =>
        completeTeamDestination({
          workspaceId: chat.me?.workspaceId,
          releaseVersion: target.releaseVersion,
        }),
      );
  }
});
</script>
<template>
  <section
    class="app-update"
    :class="{ 'is-inline': inline }"
    aria-label="Обновления INDEX12"
  >
    <div class="update-heading">
      <UiIcon name="refresh" /><strong>{{
        updates.available ? "Доступно обновление" : "Обновления"
      }}</strong>
    </div>
    <p v-if="updates.available">
      Установлена новая версия INDEX12. Нажмите «Обновить», чтобы загрузить её.
    </p>
    <p v-else-if="updates.checking" role="status">Проверяем обновления…</p>
    <p v-else-if="updates.latest">У вас актуальная версия INDEX12.</p>
    <p v-if="date && !inline" class="update-date">Версия от {{ date }}</p>
    <div class="update-actions">
      <button
        type="button"
        class="update-main"
        :disabled="updates.updating"
        @click="updates.update(chat)"
      >
        {{ updates.updating ? "Обновляем…" : "Обновить" }}</button
      ><button
        v-if="!inline"
        type="button"
        :disabled="updates.checking || updates.updating"
        @click="updates.check(true)"
      >
        Проверить
      </button>
    </div>
    <p v-if="updates.error" class="update-error" role="alert">
      {{ updates.error }}
    </p>
  </section>
</template>
<style scoped>
.app-update {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 16px;
  color: var(--codex-pane-text, var(--color-text));
  font-size: 13px;
  line-height: 1.5;
}
.app-update.is-inline {
  margin: 12px auto;
  max-width: 360px;
  border: 1px solid var(--codex-pane-border, var(--color-border));
  border-radius: 10px;
  background: var(--codex-pane-surface, var(--color-background-soft));
}
.update-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.update-heading strong {
  font-size: 14px;
  font-weight: 500;
}
.update-heading .ui-icon {
  width: 18px;
  height: 18px;
  flex: none;
}
.app-update p {
  margin: 0;
}
.update-date {
  font-size: 12px;
  color: var(--codex-pane-muted, var(--color-text));
}
.update-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.update-actions button {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--codex-pane-border, var(--color-border));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.update-actions .update-main {
  background: var(--codex-pane-accent, var(--color-primary));
  border-color: transparent;
  color: var(--codex-pane-send-text, #fff);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--codex-pane-focus, var(--color-primary));
  outline-offset: 2px;
}
.update-error {
  color: var(--codex-pane-danger, var(--color-danger, #bd4942));
  font-size: 12px;
}
</style>
