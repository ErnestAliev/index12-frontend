import "/src/assets/main.css";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { useMainStore } from "/src/stores/mainStore.js";
import Frame from "/src/components/ChatWindowFrame.vue";
import Assistant from "/src/components/DesktopAssistant.vue";
const pinia = createPinia();
useMainStore(pinia).user = {
  id: "actor",
  currentWorkspaceId: "workspace",
  role: "admin",
};
const app = createApp({
  render: () =>
    h(
      Frame,
      { open: true, mobile: window.fixtureMobile, title: "Чат Codex" },
      {
        default: () =>
          h(Assistant, {
            apiBaseUrl: location.origin + "/api",
            mobile: window.fixtureMobile,
          }),
      },
    ),
});
app.use(pinia);
app.mount("#app");
