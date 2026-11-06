import { defineStore } from "pinia";
import { ref } from "vue";
export const useCodexDeliveryStore = defineStore("codexDelivery", () => {
  const scope = ref(""),
    rows = ref([]);
  function release(row) {
    for (const file of row.sourceFiles || [])
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
        file.previewUrl = null;
      }
  }
  function setScope(value) {
    if (scope.value !== value) {
      rows.value.forEach(release);
      rows.value = [];
      scope.value = value;
    }
  }
  function add(row) {
    rows.value.push(row);
    return rows.value.at(-1);
  }
  function remove(id) {
    const row = rows.value.find((row) => row.id === id);
    if (row) release(row);
    rows.value = rows.value.filter((row) => row.id !== id);
  }
  function interrupt() {
    for (const row of rows.value)
      if (row.delivery === "sending") {
        row.delivery = "failed";
        row.sendError = "Отправка прервана. Повторите отправку.";
      }
  }
  function reconcile(chatId, canonical, allowTextMatch = true) {
    for (const row of [...rows.value].filter((row) => row.chatId === chatId)) {
      const found = canonical.some(
        (message) =>
          message.role === "user" &&
          (String(message.id).endsWith(":" + row.requestId + ":user") ||
            (allowTextMatch &&
              row.accepted &&
              !row.knownIds.includes(message.id) &&
              (message.text ?? message.content) === row.text &&
              JSON.stringify(
                (message.attachments || []).map((f) => [f.name, f.size]),
              ) ===
                JSON.stringify(
                  (row.attachments || []).map((f) => [f.name, f.size]),
                ))),
      );
      if (found) remove(row.id);
    }
  }
  return { scope, rows, setScope, add, remove, interrupt, reconcile };
});
