import "/src/assets/main.css";
import { createApp, h, ref } from "vue";
import { createPinia } from "pinia";
import { useTeamChatStore, teamApi } from "/src/stores/teamChatStore.js";
import Frame from "/src/components/ChatWindowFrame.vue";
import Chat from "/src/components/TeamChatConversation.vue";
import Panel from "/src/components/TeamTaskPanel.vue";
document.documentElement.dataset.theme = "light";
const canvas = document.createElement("canvas");
canvas.width = 1200;
canvas.height = 800;
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#3b6763";
ctx.fillRect(0, 0, 1200, 800);
const blob = await (await fetch(canvas.toDataURL())).blob();
const file = {
  fileId: "11111111-1111-4111-8111-111111111111",
  name: "Фото.png",
  mimeType: "image/png",
  size: blob.size,
};
window.fileGets = 0;
window.uploads = 0;
window.failMedia = false;
window.fileDelay = 800;
window.uploadDelay = 600;
window.mediaGate = new Promise((r) => (window.releaseMedia = r));
window.photoBlob = blob;
window.photoFile = file;
teamApi.defaults.adapter = async (config) => {
  if (config.url === "/files") {
    window.uploads++;
    await new Promise((r) => setTimeout(r, window.uploadDelay));
    return {
      status: 200,
      data: { file: { ...file, fileId: "uploaded-photo" } },
    };
  }
  if (config.url === "/messages" && config.method === "post") {
    const body = JSON.parse(config.data);
    return {
      status: 200,
      data: {
        message: {
          _id: body.id,
          authorId: "actor",
          authorName: "Эрнест",
          createdAt: new Date().toISOString(),
          text: body.text,
          attachments: [{ ...file, fileId: "uploaded-photo" }],
        },
      },
    };
  }
  if (config.url.startsWith("/files/")) {
    window.fileGets++;
    await window.mediaGate;
    await new Promise((r) => setTimeout(r, 50));
    if (window.failMedia) throw Error("Проверка ошибки загрузки");
    return { status: 200, data: blob };
  }
  return { status: 200, data: { messages: [], hasMore: false } };
};
const mode = ref("chat");
window.mediaMode = mode;
window.revoked = [];
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = (url) => {
  window.revoked.push(url);
  revoke(url);
};
const app = createApp({
  render: () =>
    h(
      Frame,
      { open: true, mobile: true, hideHeading: true },
      {
        default: () =>
          mode.value === "chat"
            ? h(Chat, { mobile: true })
            : h(Panel, {
                mobile: true,
                creating: mode.value === "new",
                taskId:
                  mode.value === "task"
                    ? "22222222-2222-4222-8222-222222222222"
                    : null,
              }),
      },
    ),
});
const pinia = createPinia();
app.use(pinia);
const chat = useTeamChatStore(pinia);
chat.me = {
  actorId: "actor",
  owner: true,
  status: "active",
  workspaceId: "workspace",
  displayName: "Эрнест",
  roles: {},
};
chat.historyReady = true;
chat.state.messages = [
  {
    _id: "33333333-3333-4333-8333-333333333333",
    authorId: "actor",
    authorName: "Эрнест",
    text: "Фото",
    attachments: [file],
    createdAt: new Date().toISOString(),
  },
];
chat.state.people = [{ _id: "actor", name: "Эрнест" }];
chat.state.tasks = [
  {
    _id: "22222222-2222-4222-8222-222222222222",
    description: "Проверить фото",
    assigneeIds: ["actor"],
    assignees: [{ actorId: "actor", name: "Эрнест" }],
    creatorId: "actor",
    creatorName: "Эрнест",
    timing: "none",
    status: "open",
    attachments: [file],
  },
];
window.chatFixture = chat;
app.mount("#app");
